using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using Agentic.Api.Data;
using Agentic.Api.Domain;
using Agentic.Api.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace Agentic.Tests;

/// <summary>Mail captured in memory; the digest worker is driven by the tests with a chosen clock.</summary>
public sealed class AccountMailFactory : WebApplicationFactory<Program>
{
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), "agentic-acct-" + Guid.NewGuid().ToString("N") + ".db");
    public FakeEmailSender Mail { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Production");
        builder.UseSetting("ConnectionStrings:Default", "Data Source=" + _dbPath);
        builder.UseSetting("Seed:Demo", "true");
        builder.UseSetting("Auth:AttemptsPer10Min", "1000");
        builder.UseSetting("Protocol:SubmitPerHour", "1000");
        builder.UseSetting("Email:PollMs", "50");
        builder.UseSetting("Email:DelayMs", "0");
        builder.UseSetting("Digest:Enabled", "false");
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

public sealed class AccountEmailTests(AccountMailFactory factory) : IClassFixture<AccountMailFactory>
{
    private const string Pw = "correct horse battery";
    private HttpClient Client() => factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });

    private async Task<(HttpClient c, string id, string address)> SignUp(string email, string name, string template = "investor")
    {
        var c = Client();
        var res = await c.PostAsJsonAsync("/api/auth/signup", new { name, email, password = Pw, headline = "Partner at Example Capital", template, topics = new[] { "Inference" } });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var body = (await res.Content.ReadFromJsonAsync<JsonObject>())!;
        return (c, (string)body["id"]!, (string)body["agentAddress"]!);
    }

    private async Task<List<OutboundEmail>> MailTo(string to, string kind, int count = 1)
    {
        for (var i = 0; i < 100; i++)
        {
            var got = factory.Mail.Sent.Where(m => m.To == to && m.Kind == kind).ToList();
            if (got.Count >= count) return got;
            await Task.Delay(50);
        }
        return factory.Mail.Sent.Where(m => m.To == to && m.Kind == kind).ToList();
    }

    private static string Token(OutboundEmail mail, string route)
    {
        var marker = "https://agentic.test/#" + route + ".";
        var at = mail.Text.IndexOf(marker, StringComparison.Ordinal);
        Assert.True(at >= 0, route + " link missing");
        return new string(mail.Text[(at + marker.Length)..].TakeWhile(ch => char.IsLetterOrDigit(ch) || ch is '-' or '_').ToArray());
    }

    private async Task Verify(string email)
    {
        var token = Token((await MailTo(email, "verify")).Last(), "verify");
        (await Client().PostAsJsonAsync("/api/auth/verify", new { token })).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Sign_up_sends_a_confirmation_link_and_a_company_address_earns_the_work_email_claim()
    {
        var (c, id, _) = await SignUp("vera@northwind.dev", "Vera Work");
        var account = await c.GetFromJsonAsync<JsonObject>("/api/account");
        Assert.False((bool)account!["emailVerified"]!);
        Assert.True((bool)account["hasPassword"]!);

        var mail = (await MailTo("vera@northwind.dev", "verify")).Single();
        Assert.Equal("Confirm your email for Agentic Business Network", mail.Subject);
        var token = Token(mail, "verify");

        var res = await Client().PostAsJsonAsync("/api/auth/verify", new { token });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.True((bool)(await res.Content.ReadFromJsonAsync<JsonObject>())!["workEmail"]!);
        Assert.Equal(HttpStatusCode.BadRequest, (await Client().PostAsJsonAsync("/api/auth/verify", new { token })).StatusCode);

        account = await c.GetFromJsonAsync<JsonObject>("/api/account");
        Assert.True((bool)account!["emailVerified"]!);
        var boot = await c.GetFromJsonAsync<JsonObject>("/api/bootstrap");
        Assert.Contains("work_email", boot!["people"]![id]!["verified"]!.AsArray().Select(v => (string)v!));
        Assert.Equal(HttpStatusCode.Conflict, (await c.PostAsync("/api/account/verify/resend", null)).StatusCode);
    }

    [Fact]
    public async Task A_consumer_address_is_confirmed_but_is_not_a_work_email()
    {
        await SignUp("gina.free@gmail.com", "Gina Free");
        var token = Token((await MailTo("gina.free@gmail.com", "verify")).Single(), "verify");
        var res = await Client().PostAsJsonAsync("/api/auth/verify", new { token });
        Assert.False((bool)(await res.Content.ReadFromJsonAsync<JsonObject>())!["workEmail"]!);
        Assert.True(Accounts.IsFreeMail("x@GMAIL.com"));
        Assert.False(Accounts.IsFreeMail("x@tidewell.vc"));
    }

    [Fact]
    public async Task Password_reset_ends_other_sessions_and_works_once()
    {
        var (oldSession, _, _) = await SignUp("reset.me@northwind.dev", "Reset Me");

        // Unknown addresses get the same answer and no email.
        Assert.Equal(HttpStatusCode.OK, (await Client().PostAsJsonAsync("/api/auth/reset/request", new { email = "nobody@northwind.dev" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client().PostAsJsonAsync("/api/auth/reset/request", new { email = "Reset.Me@northwind.dev" })).StatusCode);
        var token = Token((await MailTo("reset.me@northwind.dev", "reset")).Single(), "reset");
        Assert.DoesNotContain(factory.Mail.Sent, m => m.To == "nobody@northwind.dev");

        var browser = Client();
        Assert.Equal(HttpStatusCode.BadRequest, (await browser.PostAsJsonAsync("/api/auth/reset", new { token, password = "short" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await browser.PostAsJsonAsync("/api/auth/reset", new { token, password = "a brand new password" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync("/api/bootstrap")).StatusCode);   // signed in by the reset
        Assert.Equal(HttpStatusCode.Unauthorized, (await oldSession.GetAsync("/api/bootstrap")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Client().PostAsJsonAsync("/api/auth/reset", new { token, password = "another new password" })).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().PostAsJsonAsync("/api/auth/login", new { email = "reset.me@northwind.dev", password = Pw })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client().PostAsJsonAsync("/api/auth/login", new { email = "reset.me@northwind.dev", password = "a brand new password" })).StatusCode);
        // Following the emailed link also proved the address.
        Assert.True((bool)(await browser.GetFromJsonAsync<JsonObject>("/api/account"))!["emailVerified"]!);
    }

    [Fact]
    public async Task Changing_the_password_or_signing_out_everywhere_keeps_only_this_session()
    {
        var (c, _, _) = await SignUp("sessions@northwind.dev", "Ses Sions");
        var laptop = Client();
        (await laptop.PostAsJsonAsync("/api/auth/login", new { email = "sessions@northwind.dev", password = Pw })).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.BadRequest, (await c.PutAsJsonAsync("/api/account/password", new { current = "wrong one", password = "a brand new password" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.PutAsJsonAsync("/api/account/password", new { current = Pw, password = "a brand new password" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync("/api/bootstrap")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await laptop.GetAsync("/api/bootstrap")).StatusCode);

        var phone = Client();
        (await phone.PostAsJsonAsync("/api/auth/login", new { email = "sessions@northwind.dev", password = "a brand new password" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.OK, (await c.PostAsync("/api/account/signout-all", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync("/api/bootstrap")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await phone.GetAsync("/api/bootstrap")).StatusCode);
    }

    [Fact]
    public async Task The_daily_digest_goes_out_once_a_day_at_the_start_of_working_hours()
    {
        var (owner, id, address) = await SignUp("digest@northwind.dev", "Dora Digest");
        await Verify("digest@northwind.dev");

        var pitch = new
        {
            business_intent_version = "0.1",
            sender = new { display_name = "Lena Hoff", organization = "Quiverline" },
            recipient = new { agent_address = address },
            intent = new { category = "fundraising", objective = "Meet about our $900K pre-seed", value_proposition = "Cuts inference cost by 38%", requested_action = "meet", topics = new[] { "Inference" }, stage = "Pre-seed", round_size_usd = 900000, geo = "Europe" },
            fit_evidence = new[] { new { type = "round", value = "$900K pre-seed" }, new { type = "traction", value = "$40K MRR" }, new { type = "deck", value = "https://example.org/deck" } },
        };
        var sub = await Client().PostAsync("/v1/intents", new StringContent(System.Text.Json.JsonSerializer.Serialize(pitch), Encoding.UTF8, "application/json"));
        var intentId = (string)(await sub.Content.ReadFromJsonAsync<JsonObject>())!["intent_id"]!;

        var worker = factory.Services.GetRequiredService<DigestWorker>();
        var today = DateTime.UtcNow.Date;
        // Policy hours start at 09:00 CET: at 06:00 UTC (08:00 in Berlin in summer) it's too early.
        await worker.RunOnce(today.AddDays(1).AddHours(6));
        Assert.DoesNotContain(factory.Mail.Sent, m => m.To == "digest@northwind.dev" && m.Kind == "digest");
        await worker.RunOnce(today.AddDays(1).AddHours(8));
        var digest = (await MailTo("digest@northwind.dev", "digest")).Single();
        Assert.Contains("Lena Hoff", digest.Text);
        Assert.Contains("screened 1 new intent", digest.Text);
        Assert.Contains("https://agentic.test/#inbox." + intentId, digest.Text);
        Assert.StartsWith("https://agentic.test/#digest-off.", digest.UnsubscribeUrl);

        // Once a day, and no empty emails.
        await worker.RunOnce(today.AddDays(1).AddHours(12));
        await worker.RunOnce(today.AddDays(2).AddHours(8));
        await Task.Delay(300);
        Assert.Single(factory.Mail.Sent, m => m.To == "digest@northwind.dev" && m.Kind == "digest");

        // "Hold for the digest" brings an intent back the next morning.
        (await owner.PostAsJsonAsync($"/api/intents/{intentId}/action", new { action = "hold" })).EnsureSuccessStatusCode();
        await worker.RunOnce(today.AddDays(3).AddHours(8));
        var second = (await MailTo("digest@northwind.dev", "digest", 2)).Last();
        Assert.Contains("[HELD", second.Text);

        // The one-click link in the email turns digests off.
        var offToken = second.UnsubscribeUrl![(second.UnsubscribeUrl.IndexOf("#digest-off.", StringComparison.Ordinal) + 12)..];
        Assert.Equal(HttpStatusCode.OK, (await Client().PostAsJsonAsync("/api/digest/off", new { token = offToken })).StatusCode);
        Assert.False((bool)(await owner.GetFromJsonAsync<JsonObject>("/api/account"))!["digestEnabled"]!);
        _ = id;
    }

    [Fact]
    public async Task Unconfirmed_addresses_get_no_digest()
    {
        var (c, _, _) = await SignUp("unconfirmed@northwind.dev", "Un Confirmed");
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsync("/api/account/digest/send", null)).StatusCode);
        await factory.Services.GetRequiredService<DigestWorker>().RunOnce(DateTime.UtcNow.Date.AddDays(1).AddHours(10));
        Assert.DoesNotContain(factory.Mail.Sent, m => m.To == "unconfirmed@northwind.dev" && m.Kind == "digest");
    }

    [Theory]
    [InlineData("CET", "09:00", 6, false)]     // 08:00 in Berlin (summer time)
    [InlineData("CET", "09:00", 8, true)]
    [InlineData("PT", "09:00", 15, false)]     // 08:00 in Los Angeles
    [InlineData("PT", "09:00", 17, true)]
    [InlineData("Not/AZone", "09:00", 9, true)] // unknown zones count as UTC
    public void Digest_timing_follows_the_owners_time_zone(string tz, string start, int utcHour, bool due)
    {
        var policy = new PolicyDocument();
        policy.Hours.Tz = tz;
        policy.Hours.Start = start;
        var summerDay = new DateTime(2026, 7, 15, utcHour, 0, 0, DateTimeKind.Utc);
        Assert.Equal(due, Digests.Due(new Member(), policy, summerDay));
        Assert.False(Digests.Due(new Member { LastDigestAt = summerDay.AddMinutes(-30) }, policy, summerDay));
    }
}
