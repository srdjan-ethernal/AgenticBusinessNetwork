using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Agentic.Tests;

/// <summary>A public server can gate development sign-in behind a shared access code.</summary>
public sealed class AccessCodeFactory : WebApplicationFactory<Program>
{
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), "agentic-code-" + Guid.NewGuid().ToString("N") + ".db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Production");
        builder.UseSetting("ConnectionStrings:Default", "Data Source=" + _dbPath);
        builder.UseSetting("Auth:DevLogin", "true");
        builder.UseSetting("Auth:AccessCode", "tidewater-42");
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        foreach (var f in new[] { _dbPath, _dbPath + "-shm", _dbPath + "-wal" })
            if (File.Exists(f)) File.Delete(f);
    }
}

public sealed class AccessCodeTests(AccessCodeFactory factory) : IClassFixture<AccessCodeFactory>
{
    [Fact]
    public async Task Sign_in_requires_the_access_code()
    {
        var c = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        var health = await c.GetFromJsonAsync<JsonObject>("/api/health");
        Assert.True((bool)health!["accessCodeRequired"]!);

        var wrong = await c.PostAsJsonAsync("/api/session", new { memberId = "maya-okafor", accessCode = "guess" });
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);

        var right = await c.PostAsJsonAsync("/api/session", new { memberId = "maya-okafor", accessCode = "tidewater-42" });
        right.EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync("/api/bootstrap")).StatusCode);
    }

    [Fact]
    public async Task Sign_up_is_invite_only_while_an_access_code_is_set()
    {
        var c = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        object Body(string? code) => new { name = "Invited Person", email = "invited@example.org", password = "correct horse battery", headline = "Partner at Example Capital", template = "investor", accessCode = code };

        Assert.Equal(HttpStatusCode.Unauthorized, (await c.PostAsJsonAsync("/api/auth/signup", Body(null))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.PostAsJsonAsync("/api/auth/signup", Body("guess"))).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await c.PostAsJsonAsync("/api/auth/signup", Body("tidewater-42"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync("/api/bootstrap")).StatusCode);
    }

    [Fact]
    public async Task Serves_the_web_client_and_forwards_the_client_ip()
    {
        var c = factory.CreateClient();
        var home = await c.GetAsync("/");
        Assert.Equal(HttpStatusCode.OK, home.StatusCode);
        Assert.Contains("js/api.js", await home.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, (await c.GetAsync("/css/styles.css")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync("/README.md")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await c.GetAsync("/src/Agentic.Api/appsettings.json")).StatusCode);
    }
}
