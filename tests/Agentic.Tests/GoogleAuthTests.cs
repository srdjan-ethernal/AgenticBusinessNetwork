using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json.Nodes;
using Agentic.Api.Endpoints;
using Agentic.Api.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace Agentic.Tests;

/// <summary>Google sign-in configured with fake credentials, an access code, and a test-only endpoint that
/// plays Google's part: it signs a Google identity into the External cookie, as the real callback would.</summary>
public sealed class GoogleFactory : WebApplicationFactory<Program>
{
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), "agentic-google-" + Guid.NewGuid().ToString("N") + ".db");
    public FakeEmailSender Mail { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Production");
        builder.UseSetting("ConnectionStrings:Default", "Data Source=" + _dbPath);
        builder.UseSetting("Seed:Demo", "true");
        builder.UseSetting("Auth:AttemptsPer10Min", "1000");
        builder.UseSetting("Auth:AccessCode", "club-7");
        builder.UseSetting("Auth:Google:ClientId", "test-client.apps.googleusercontent.com");
        builder.UseSetting("Auth:Google:ClientSecret", "test-secret");
        builder.UseSetting("Email:PollMs", "50");
        builder.UseSetting("Email:DelayMs", "0");
        builder.UseSetting("App:PublicUrl", "https://agentic.test");
        builder.ConfigureTestServices(s =>
        {
            s.AddSingleton<IEmailSender>(Mail);
            s.AddSingleton<IStartupFilter, FakeGoogle>();
        });
    }

    private sealed class FakeGoogle : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.Use(async (ctx, nextMw) =>
            {
                if (ctx.Request.Path != "/__test/google") { await nextMw(); return; }
                var q = ctx.Request.Query;
                var identity = new ClaimsIdentity(
                [
                    new Claim(ClaimTypes.NameIdentifier, q["sub"]!), new Claim(ClaimTypes.Email, q["email"]!),
                    new Claim(ClaimTypes.Name, q["name"]!), new Claim("email_verified", q["verified"].ToString() is { Length: > 0 } v ? v : "true"),
                ], "Google");
                var props = new AuthenticationProperties();
                if (q["invite"].ToString() is { Length: > 0 } invite) props.Items["invite"] = invite;
                await ctx.SignInAsync(GoogleAuthApi.ExternalScheme, new ClaimsPrincipal(identity), props);
            });
            next(app);
        };
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        foreach (var f in new[] { _dbPath, _dbPath + "-shm", _dbPath + "-wal" })
            if (File.Exists(f)) File.Delete(f);
    }
}

public sealed class GoogleAuthTests(GoogleFactory factory) : IClassFixture<GoogleFactory>
{
    private HttpClient Client() => factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true, AllowAutoRedirect = false });

    /// <summary>What the browser has after Google sent the person back: the External cookie.</summary>
    private static async Task Google(HttpClient c, string sub, string email, string name, bool verified = true, string? invite = null)
    {
        var url = $"/__test/google?sub={sub}&email={Uri.EscapeDataString(email)}&name={Uri.EscapeDataString(name)}&verified={(verified ? "true" : "false")}" + (invite is null ? "" : "&invite=" + invite);
        (await c.GetAsync(url)).EnsureSuccessStatusCode();
    }

    private static async Task<string> Done(HttpClient c) => (await c.GetAsync("/api/auth/google/done")).Headers.Location!.OriginalString;

    private static object Profile(string? accessCode = null) => new { headline = "Founder at Gridlane · Climate", location = "Novi Sad", template = "founder", topics = new[] { "Climate" }, accessCode };

    [Fact]
    public async Task Continue_with_google_redirects_to_google()
    {
        var c = Client();
        var health = await c.GetFromJsonAsync<JsonObject>("/api/health");
        Assert.True((bool)health!["google"]!);

        var res = await c.GetAsync("/api/auth/google?invite=abc");
        Assert.Equal(HttpStatusCode.Redirect, res.StatusCode);
        var location = res.Headers.Location!.ToString();
        Assert.StartsWith("https://accounts.google.com/", location);
        Assert.Contains("client_id=test-client.apps.googleusercontent.com", location);
        Assert.Contains("redirect_uri=" + Uri.EscapeDataString("http://localhost/signin-google"), location);
        var scope = System.Web.HttpUtility.ParseQueryString(new Uri(location).Query)["scope"]!.Split(' ');
        Assert.Contains("email", scope);
        Assert.Contains("profile", scope);
    }

    [Fact]
    public async Task A_new_person_finishes_sign_up_and_later_signs_in_with_google()
    {
        var c = Client();
        await Google(c, "g-100", "nina@gmail.com", "Nina Jurić");
        Assert.Equal("/#join.google", await Done(c));

        var ext = await c.GetFromJsonAsync<JsonObject>("/api/auth/external");
        Assert.Equal("Nina Jurić", (string)ext!["name"]!);
        Assert.Equal("nina@gmail.com", (string)ext["email"]!);
        Assert.True((bool)ext["accessCodeRequired"]!);

        // Invite-only server: Google alone is not enough.
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.PostAsJsonAsync("/api/auth/signup/external", Profile())).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync("/api/auth/signup/external", new { headline = "x", accessCode = "club-7" })).StatusCode);
        var res = await c.PostAsJsonAsync("/api/auth/signup/external", Profile("club-7"));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        Assert.Equal("nina-juric", (string)(await res.Content.ReadFromJsonAsync<JsonObject>())!["id"]!);

        var boot = await c.GetFromJsonAsync<JsonObject>("/api/bootstrap");
        Assert.Equal("nina-juric", (string)boot!["me"]!);
        Assert.Equal("Novi Sad", (string)boot["people"]!["nina-juric"]!["loc"]!);
        // The Google identity was used up.
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync("/api/auth/external")).StatusCode);

        // Another browser, later: Google alone signs her in. No password exists for this account.
        var later = Client();
        await Google(later, "g-100", "nina@gmail.com", "Nina Jurić");
        Assert.Equal("/#feed", await Done(later));
        Assert.Equal("nina-juric", (string)(await later.GetFromJsonAsync<JsonObject>("/api/bootstrap"))!["me"]!);
        var pw = await Client().PostAsJsonAsync("/api/auth/login", new { email = "nina@gmail.com", password = "" });
        Assert.Equal(HttpStatusCode.Unauthorized, pw.StatusCode);
    }

    [Fact]
    public async Task A_verified_google_address_links_the_existing_password_account()
    {
        var owner = Client();
        (await owner.PostAsJsonAsync("/api/auth/signup", new { name = "Pavle Marković", email = "pavle@example.org", password = "correct horse battery", headline = "CTO at Example", accessCode = "club-7" })).EnsureSuccessStatusCode();

        var unverified = Client();
        await Google(unverified, "g-200", "Pavle@Example.org", "Pavle M", verified: false);
        Assert.Equal("/#signin.google-password", await Done(unverified));

        var c = Client();
        await Google(c, "g-201", "Pavle@Example.org", "Pavle M");
        Assert.Equal("/#feed", await Done(c));
        Assert.Equal("pavle-markovic", (string)(await c.GetFromJsonAsync<JsonObject>("/api/bootstrap"))!["me"]!);

        // The password still works, and a different Google account can't take the address over.
        Assert.Equal(HttpStatusCode.OK, (await Client().PostAsJsonAsync("/api/auth/login", new { email = "pavle@example.org", password = "correct horse battery" })).StatusCode);
        var other = Client();
        await Google(other, "g-999", "pavle@example.org", "Impostor");
        Assert.Equal("/#signin.google-other", await Done(other));
    }

    [Fact]
    public async Task An_invitation_works_with_google_without_the_access_code()
    {
        var owner = Client();
        (await owner.PostAsJsonAsync("/api/auth/signup", new { name = "Host Person", email = "host.g@example.org", password = "correct horse battery", headline = "Partner at Example", accessCode = "club-7" })).EnsureSuccessStatusCode();
        var csv = "First Name,Last Name,URL,Email Address,Company,Position,Connected On\nIva,Kostić,https://www.linkedin.com/in/iva-k,iva@gmail.com,Solaris,COO,01 Jan 2024\n";
        var upload = new ByteArrayContent(Encoding.UTF8.GetBytes(csv));
        upload.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        (await owner.PostAsync("/api/contacts/import", upload)).EnsureSuccessStatusCode();
        var contactId = (int)(await owner.GetFromJsonAsync<JsonObject>("/api/contacts"))!["contacts"]![0]!["id"]!;
        var link = (string)(await (await owner.PostAsync($"/api/contacts/{contactId}/link", null)).Content.ReadFromJsonAsync<JsonObject>())!["url"]!;
        var code = link[(link.IndexOf("#invite.", StringComparison.Ordinal) + 8)..];

        var guest = Client();
        await Google(guest, "g-300", "iva@gmail.com", "Iva Kostić", invite: code);
        Assert.Equal("/#join.google", await Done(guest));
        var ext = await guest.GetFromJsonAsync<JsonObject>("/api/auth/external");
        Assert.Equal("Host Person", (string)ext!["invitedBy"]!["name"]!);
        Assert.Equal("COO at Solaris", (string)ext["headline"]!);
        Assert.False((bool)ext["accessCodeRequired"]!);

        var res = await guest.PostAsJsonAsync("/api/auth/signup/external", new { headline = "COO at Solaris", template = "founder" });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var boot = await guest.GetFromJsonAsync<JsonObject>("/api/bootstrap");
        Assert.Equal("1st", (string)boot!["people"]!["host-person"]!["degree"]!);
        Assert.Equal(HttpStatusCode.Gone, (await Client().GetAsync("/api/invites/" + code)).StatusCode);
    }

    [Fact]
    public async Task Nothing_to_finish_without_a_google_sign_in()
    {
        var c = Client();
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync("/api/auth/external")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.PostAsJsonAsync("/api/auth/signup/external", Profile("club-7"))).StatusCode);
        Assert.Equal("/#signin.google-failed", await Done(c));
    }
}

public sealed class GoogleOffTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Google_is_off_without_credentials()
    {
        var c = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        Assert.False((bool)(await c.GetFromJsonAsync<JsonObject>("/api/health"))!["google"]!);
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync("/api/auth/google")).StatusCode);
    }
}
