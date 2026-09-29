using System.Collections.Concurrent;
using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using Agentic.Api.Data;
using Agentic.Api.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace Agentic.Tests;

public sealed class FakeEmailSender : IEmailSender
{
    public ConcurrentQueue<OutboundEmail> Sent { get; } = new();
    public bool Delivers => true;
    public Task SendAsync(OutboundEmail mail, CancellationToken ct) { Sent.Enqueue(mail); return Task.CompletedTask; }
}

/// <summary>Like <see cref="ApiFactory"/>, with mail captured in memory and a small daily invite limit.</summary>
public sealed class MailFactory : WebApplicationFactory<Program>
{
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), "agentic-mail-" + Guid.NewGuid().ToString("N") + ".db");
    public FakeEmailSender Mail { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Production");
        builder.UseSetting("ConnectionStrings:Default", "Data Source=" + _dbPath);
        builder.UseSetting("Seed:Demo", "true");
        builder.UseSetting("Auth:AttemptsPer10Min", "1000");
        builder.UseSetting("Invites:PerDay", "5");
        builder.UseSetting("Email:PollMs", "50");
        builder.UseSetting("Email:DelayMs", "0");
        builder.UseSetting("App:PublicUrl", "https://agentic.test");
        builder.ConfigureTestServices(s => s.AddSingleton<IEmailSender>(Mail));
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        foreach (var f in new[] { _dbPath, _dbPath + "-shm", _dbPath + "-wal" })
            if (File.Exists(f)) File.Delete(f);
    }
}

public sealed class ContactsTests(MailFactory factory) : IClassFixture<MailFactory>
{
    private const string Header =
        "Notes:\r\n\"When exporting your connection data, you may notice that some of the email addresses are missing. You will only see email addresses for connections who have allowed their connections to see or download their email address.\"\r\n\r\n" +
        "First Name,Last Name,URL,Email Address,Company,Position,Connected On\r\n";

    private static string Csv(string tag, params string[] extra) => "﻿" + Header +
        $"Ana,Marić,https://www.linkedin.com/in/ana-maric-{tag}/,ana.{tag}@example.org,\"Brightline, Inc.\",Head of Data,12 Mar 2024\r\n" +
        $"Marko,Jovanović,https://www.linkedin.com/in/marko-{tag},,Northwind,CTO,01 Feb 2023\r\n" +
        $"Lena,\"Hoff \"\"LH\"\"\",https://www.linkedin.com/in/lena-{tag},LENA.{tag}@Example.org,Quiverline,\"Founder,\nCEO\",05 Jan 2022\r\n" +
        string.Concat(extra.Select(e => e + "\r\n"));

    private HttpClient Client() => factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });

    private async Task<HttpClient> Owner(string email, string name)
    {
        var c = Client();
        var res = await c.PostAsJsonAsync("/api/auth/signup", new { name, email, password = "correct horse battery", headline = "Partner at Example Capital", template = "investor" });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return c;
    }

    private static Task<HttpResponseMessage> Upload(HttpClient c, byte[] data, string type = "application/octet-stream")
    {
        var content = new ByteArrayContent(data);
        content.Headers.ContentType = new MediaTypeHeaderValue(type);
        return c.PostAsync("/api/contacts/import", content);
    }

    private static byte[] Zip(string csv)
    {
        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, true))
        {
            using (var w = new StreamWriter(zip.CreateEntry("Basic_LinkedInDataExport_09-29-2026/Profile.csv").Open())) w.Write("First Name,Last Name\nX,Y\n");
            using (var w = new StreamWriter(zip.CreateEntry("Basic_LinkedInDataExport_09-29-2026/Connections.csv").Open(), new UTF8Encoding(false))) w.Write(csv);
        }
        return ms.ToArray();
    }

    private async Task<List<OutboundEmail>> WaitForMail(string to, int count = 1)
    {
        for (var i = 0; i < 100; i++)
        {
            var got = factory.Mail.Sent.Where(m => m.To == to).ToList();
            if (got.Count >= count) return got;
            await Task.Delay(50);
        }
        return factory.Mail.Sent.Where(m => m.To == to).ToList();
    }

    private static string CodeFrom(OutboundEmail mail)
    {
        const string marker = "https://agentic.test/#invite.";
        var at = mail.Text.IndexOf(marker, StringComparison.Ordinal);
        Assert.True(at >= 0, "invite link missing");
        return new string(mail.Text[(at + marker.Length)..].TakeWhile(ch => char.IsLetterOrDigit(ch) || ch is '-' or '_').ToArray());
    }

    [Fact]
    public void Parses_the_linkedin_format()
    {
        var (rows, error) = Contacts.ParseLinkedIn(Csv("p").TrimStart('﻿'));
        Assert.Null(error);
        Assert.Equal(3, rows.Count);
        Assert.Equal(new Contacts.Row("Ana", "Marić", "ana.p@example.org", "Brightline, Inc.", "Head of Data", "https://www.linkedin.com/in/ana-maric-p", "12 Mar 2024"), rows[0]);
        Assert.Null(rows[1].Email);
        Assert.Equal("Hoff \"LH\"", rows[2].Last);
        Assert.Equal("lena.p@example.org", rows[2].Email);
        Assert.Equal("Founder,\nCEO", rows[2].Position);

        Assert.NotNull(Contacts.ParseLinkedIn("Name,Phone\nA,1\n").error);
    }

    [Fact]
    public async Task Imports_the_csv_or_the_whole_archive_without_duplicates()
    {
        var c = await Owner("importer@example.org", "Imo Porter");
        var res = await Upload(c, Encoding.UTF8.GetBytes(Csv("i")));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var r = await res.Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal(3, (int)r!["added"]!);
        Assert.Equal(2, (int)r["withEmail"]!);

        // The same connections again, now inside LinkedIn's zip: updated, not duplicated.
        var again = await (await Upload(c, Zip(Csv("i")))).Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal(0, (int)again!["added"]!);
        Assert.Equal(3, (int)again["updated"]!);

        var list = await c.GetFromJsonAsync<JsonObject>("/api/contacts");
        Assert.Equal(3, (int)list!["summary"]!["total"]!);
        Assert.Equal(2, (int)list["summary"]!["invitable"]!);

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await Upload(c, Encoding.UTF8.GetBytes(Csv("i")), "text/csv")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Upload(c, Encoding.UTF8.GetBytes("hello"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Upload(Client(), Encoding.UTF8.GetBytes(Csv("i")))).StatusCode);
    }

    [Fact]
    public async Task Invites_everyone_with_an_email_once_and_skips_members()
    {
        await Owner("already.member@example.org", "Al Ready");
        var c = await Owner("inviter@example.org", "Iva Inviter");
        await Upload(c, Encoding.UTF8.GetBytes(Csv("v",
            "Al,Ready,https://www.linkedin.com/in/al-ready,already.member@example.org,Example,Partner,01 Jan 2020",
            "Iva,Myself,https://www.linkedin.com/in/iva-me,inviter@example.org,Example,Partner,01 Jan 2020")));
        // Your own address in the export is never imported.
        Assert.Equal(4, (int)(await c.GetFromJsonAsync<JsonObject>("/api/contacts"))!["summary"]!["total"]!);

        var res = await c.PostAsJsonAsync("/api/contacts/invite", new { all = true, note = "Would love to have you there, {first}." });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var r = await res.Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal(2, (int)r!["queued"]!);
        Assert.Equal(1, (int)r["noEmail"]!);
        Assert.Equal(1, (int)r["onNetwork"]!);

        var mail = (await WaitForMail("ana.v@example.org")).Single();
        Assert.Equal("Iva Inviter invited you to Agentic Business Network", mail.Subject);
        Assert.Equal("inviter@example.org", mail.ReplyTo);
        Assert.Contains("Hi Ana,", mail.Text);
        Assert.Contains("Would love to have you there, Ana.", mail.Text);
        Assert.Contains("https://agentic.test/#optout.", mail.Text);
        Assert.Contains("Set up your agent", mail.Html);
        await WaitForMail("lena.v@example.org");

        // Nobody gets a second email right away.
        var again = await (await c.PostAsJsonAsync("/api/contacts/invite", new { all = true })).Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal(0, (int)again!["queued"]!);
        Assert.Equal(2, (int)again["alreadyInvited"]!);
    }

    [Fact]
    public async Task Daily_limit_caps_a_batch()
    {
        var c = await Owner("busy@example.org", "Bu Sy");
        var extra = Enumerable.Range(1, 5).Select(i => $"P{i},Person,https://www.linkedin.com/in/p{i}-busy,p{i}.busy@example.org,Co,Role,01 Jan 2024").ToArray();
        await Upload(c, Encoding.UTF8.GetBytes(Csv("b", extra)));
        var r = await (await c.PostAsJsonAsync("/api/contacts/invite", new { all = true })).Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal(5, (int)r!["queued"]!);
        Assert.Equal(2, (int)r["overDailyLimit"]!);
        var list = await c.GetFromJsonAsync<JsonObject>("/api/contacts");
        Assert.Equal(0, (int)list!["remainingToday"]!);
    }

    [Fact]
    public async Task Accepting_an_invitation_connects_both_agents_and_uses_up_the_code()
    {
        var owner = await Owner("host@example.org", "Hos Tess");
        await Upload(owner, Encoding.UTF8.GetBytes(Csv("a")));
        await owner.PostAsJsonAsync("/api/contacts/invite", new { all = true });
        var code = CodeFrom((await WaitForMail("ana.a@example.org")).Single());

        var guest = Client();
        var info = await guest.GetFromJsonAsync<JsonObject>("/api/invites/" + code);
        Assert.Equal("Ana", (string)info!["first"]!);
        Assert.Equal("ana.a@example.org", (string)info["email"]!);
        Assert.Equal("Head of Data at Brightline, Inc.", (string)info["headline"]!);
        Assert.Equal("Hos Tess", (string)info["inviter"]!["name"]!);

        var join = await guest.PostAsJsonAsync("/api/auth/signup", new { name = "Ana Marić", email = "ana.a@example.org", password = "another good password", headline = "Head of Data at Brightline", template = "founder", inviteCode = code });
        Assert.Equal(HttpStatusCode.Created, join.StatusCode);
        Assert.Equal("hos-tess", (string)(await join.Content.ReadFromJsonAsync<JsonObject>())!["invitedBy"]!);

        // Her agent knows the inviter as a 1st-degree connection, and the other way round.
        var guestBoot = await guest.GetFromJsonAsync<JsonObject>("/api/bootstrap");
        Assert.Equal("1st", (string)guestBoot!["people"]!["hos-tess"]!["degree"]!);
        var ownerBoot = await owner.GetFromJsonAsync<JsonObject>("/api/bootstrap");
        Assert.Equal("1st", (string)ownerBoot!["people"]!["ana-maric"]!["degree"]!);

        var list = await owner.GetFromJsonAsync<JsonObject>("/api/contacts");
        Assert.Equal(1, (int)list!["summary"]!["joined"]!);

        Assert.Equal(HttpStatusCode.Gone, (await Client().GetAsync("/api/invites/" + code)).StatusCode);
        var reuse = await Client().PostAsJsonAsync("/api/auth/signup", new { name = "Someone Else", email = "else@example.org", password = "another good password", headline = "Someone at Somewhere", inviteCode = code });
        Assert.Equal(HttpStatusCode.Gone, reuse.StatusCode);
    }

    [Fact]
    public async Task Opting_out_stops_every_future_invitation_to_that_address()
    {
        var first = await Owner("first.host@example.org", "Fir St");
        await Upload(first, Encoding.UTF8.GetBytes(Csv("o")));
        await first.PostAsJsonAsync("/api/contacts/invite", new { all = true });
        var code = CodeFrom((await WaitForMail("lena.o@example.org")).Single());

        Assert.Equal(HttpStatusCode.OK, (await Client().PostAsync("/api/invites/" + code + "/optout", null)).StatusCode);

        // Another member imports the same person later: the address stays suppressed.
        var second = await Owner("second.host@example.org", "Sec Ond");
        await Upload(second, Encoding.UTF8.GetBytes(Csv("o")));
        var r = await (await second.PostAsJsonAsync("/api/contacts/invite", new { all = true })).Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal(1, (int)r!["optedOut"]!);
        Assert.Equal(1, (int)r["queued"]!);   // Ana is still invited
    }

    [Fact]
    public async Task Personal_link_for_contacts_without_email_and_delete_all()
    {
        var c = await Owner("linker@example.org", "Lin Ker");
        await Upload(c, Encoding.UTF8.GetBytes(Csv("l")));
        var list = await c.GetFromJsonAsync<JsonObject>("/api/contacts");
        var marko = list!["contacts"]!.AsArray().First(x => (string)x!["first"]! == "Marko")!;
        Assert.Null(marko["email"]);
        Assert.Equal("https://www.linkedin.com/in/marko-l", (string)marko["url"]!);

        var link = await (await c.PostAsync("/api/contacts/" + (int)marko["id"]! + "/link", null)).Content.ReadFromJsonAsync<JsonObject>();
        var url = (string)link!["url"]!;
        Assert.StartsWith("https://agentic.test/#invite.", url);
        Assert.Contains("Hi Marko,", (string)link["message"]!);
        var code = url[(url.IndexOf("#invite.", StringComparison.Ordinal) + 8)..];
        Assert.Equal(HttpStatusCode.OK, (await Client().GetAsync("/api/invites/" + code)).StatusCode);

        // Other members can't read or use someone else's contacts.
        var stranger = await Owner("stranger@example.org", "Stran Ger");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsync("/api/contacts/" + (int)marko["id"]! + "/link", null)).StatusCode);
        Assert.Equal(0, (int)(await stranger.GetFromJsonAsync<JsonObject>("/api/contacts"))!["summary"]!["total"]!);

        var del = await (await c.DeleteAsync("/api/contacts")).Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal(3, (int)del!["deleted"]!);
        Assert.Equal(HttpStatusCode.Gone, (await Client().GetAsync("/api/invites/" + code)).StatusCode);
    }
}
