using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using Agentic.Api.Services;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Agentic.Tests;

/// <summary>Real accounts: sign-up, password sign-in, profile, and a new agent that receives intents.</summary>
public sealed class AccountTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private HttpClient Client() => factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });

    private static object Signup(string email, string name = "Ana Kovač", string password = "correct horse battery", string template = "founder") => new
    {
        name, email, password, headline = "Founder at Brightline · Data tooling", location = "Belgrade", template,
        topics = new[] { "Data tooling", "Developer tools", "Not a real topic" },
    };

    [Fact]
    public async Task Sign_up_creates_a_member_with_an_agent_and_a_policy()
    {
        var c = Client();
        var health = await c.GetFromJsonAsync<JsonObject>("/api/health");
        Assert.True((bool)health!["signup"]!);

        var res = await c.PostAsJsonAsync("/api/auth/signup", Signup("ana@brightline.dev"));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var created = await res.Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal("ana-kovac", (string)created!["id"]!);
        Assert.Equal("ana.kovac@agentic", (string)created["agentAddress"]!);

        // Signed in straight away.
        var boot = await c.GetFromJsonAsync<JsonObject>("/api/bootstrap");
        Assert.Equal("ana-kovac", (string)boot!["me"]!);
        var me = boot["people"]!["ana-kovac"]!;
        Assert.Equal("Founder at Brightline · Data tooling", (string)me["headline"]!);
        Assert.Equal("Belgrade", (string)me["loc"]!);
        Assert.Empty(boot["intents"]!.AsArray());

        var policy = boot["policy"]!;
        Assert.Equal("founder", (string)policy["template"]!);
        Assert.Equal(1, (int)policy["version"]!);
        Assert.Equal(["Data tooling", "Developer tools"], policy["openTo"]!.AsArray().Select(t => (string)t!));
    }

    [Fact]
    public async Task Email_is_unique_and_case_insensitive()
    {
        Assert.Equal(HttpStatusCode.Created, (await Client().PostAsJsonAsync("/api/auth/signup", Signup("dup@example.org", "Dup One"))).StatusCode);
        var again = await Client().PostAsJsonAsync("/api/auth/signup", Signup("  DUP@Example.org ", "Dup Two"));
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }

    [Fact]
    public async Task Sign_up_validates_its_input()
    {
        var c = Client();
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync("/api/auth/signup", Signup("short@example.org", password: "short"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync("/api/auth/signup", Signup("not-an-email"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync("/api/auth/signup", Signup("x@example.org", name: " "))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.GetAsync("/api/bootstrap")).StatusCode);
    }

    [Fact]
    public async Task Same_name_gets_a_distinct_id_and_address()
    {
        var a = await (await Client().PostAsJsonAsync("/api/auth/signup", Signup("jo1@example.org", "Jo Park"))).Content.ReadFromJsonAsync<JsonObject>();
        var b = await (await Client().PostAsJsonAsync("/api/auth/signup", Signup("jo2@example.org", "Jo Park"))).Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal("jo-park", (string)a!["id"]!);
        Assert.Equal("jo-park-2", (string)b!["id"]!);
        Assert.Equal("jo.park.2@agentic", (string)b["agentAddress"]!);
    }

    [Fact]
    public async Task Password_sign_in()
    {
        await Client().PostAsJsonAsync("/api/auth/signup", Signup("login@example.org", "Lou Gin"));

        var c = Client();
        var wrong = await c.PostAsJsonAsync("/api/auth/login", new { email = "login@example.org", password = "wrong password!" });
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        var unknown = await c.PostAsJsonAsync("/api/auth/login", new { email = "nobody@example.org", password = "correct horse battery" });
        Assert.Equal(HttpStatusCode.Unauthorized, unknown.StatusCode);
        // Seeded demo members have no email or password, so an empty sign-in matches nobody.
        var empty = await c.PostAsJsonAsync("/api/auth/login", new { email = "", password = "" });
        Assert.Equal(HttpStatusCode.Unauthorized, empty.StatusCode);

        var ok = await c.PostAsJsonAsync("/api/auth/login", new { email = "Login@Example.org", password = "correct horse battery" });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var boot = await c.GetFromJsonAsync<JsonObject>("/api/bootstrap");
        Assert.Equal("lou-gin", (string)boot!["me"]!);
    }

    [Fact]
    public async Task Real_accounts_are_not_offered_for_development_sign_in()
    {
        await Client().PostAsJsonAsync("/api/auth/signup", Signup("private@example.org", "Pri Vate"));
        var c = Client();
        var list = await c.GetFromJsonAsync<JsonArray>("/api/members");
        Assert.DoesNotContain(list!, m => (string)m!["id"]! == "pri-vate");
        Assert.Contains(list!, m => (string)m!["id"]! == "maya-okafor");
        var res = await c.PostAsJsonAsync("/api/session", new { memberId = "pri-vate" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Profile_update()
    {
        var c = Client();
        await c.PostAsJsonAsync("/api/auth/signup", Signup("profile@example.org", "Pro File"));

        var res = await c.PutAsJsonAsync("/api/profile", new { name = "Pro Filer", headline = "CEO at Brightline", about = "Building data tools.", topics = new[] { "Fintech" } });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var me = (await res.Content.ReadFromJsonAsync<JsonObject>())!["people"]!["pro-file"]!;
        Assert.Equal("Pro Filer", (string)me["name"]!);
        Assert.Equal("CEO at Brightline", (string)me["headline"]!);
        Assert.Equal("Building data tools.", (string)me["about"]!);
        Assert.Equal("Belgrade", (string)me["loc"]!);   // fields left out stay as they were
        Assert.Equal(["Fintech"], me["topics"]!.AsArray().Select(t => (string)t!));

        var bad = await c.PutAsJsonAsync("/api/profile", new { headline = "x" });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().PutAsJsonAsync("/api/profile", new { name = "Anyone" })).StatusCode);
    }

    [Fact]
    public async Task A_new_agent_receives_intents_through_the_protocol()
    {
        var owner = Client();
        await owner.PostAsJsonAsync("/api/auth/signup", Signup("inbox@example.org", "In Box", template: "investor"));

        var sender = Client();
        var card = await sender.GetFromJsonAsync<JsonObject>("/v1/agents/in.box@agentic/card");
        Assert.Equal("investor", (string)card!["x_agentic"]!["policy"]!["template"]!);

        var body = new
        {
            business_intent_version = "0.1",
            sender = new { display_name = "Lena Hoff", organization = "Quiverline" },
            recipient = new { agent_address = "in.box@agentic" },
            intent = new { category = "fundraising", objective = "Request a meeting about Quiverline's $900K pre-seed", value_proposition = "Data tooling for ML teams", requested_action = "meet", topics = new[] { "Data tooling" }, stage = "Pre-seed", round_size_usd = 900000, geo = "Europe" },
            fit_evidence = new[] { new { type = "round", value = "$900K pre-seed" }, new { type = "traction", value = "$40K MRR, 12 paying teams" }, new { type = "deck", value = "https://quiverline.example/deck" } },
        };
        var res = await sender.PostAsync("/v1/intents", new StringContent(System.Text.Json.JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var id = (string)(await res.Content.ReadFromJsonAsync<JsonObject>())!["intent_id"]!;

        var boot = await owner.GetFromJsonAsync<JsonObject>("/api/bootstrap");
        Assert.Contains(boot!["intents"]!.AsArray(), i => (string)i!["id"]! == id);
    }

    [Theory]
    [InlineData("Đorđe Petrović", "djordje-petrovic")]
    [InlineData("  José  María O'Neil ", "jose-maria-o-neil")]
    [InlineData("李雷", "member")]
    public void Slugs_are_ascii(string name, string slug) => Assert.Equal(slug, Accounts.Slug(name));

    [Fact]
    public void Passwords_are_salted_and_verifiable()
    {
        var a = Accounts.HashPassword("correct horse battery");
        var b = Accounts.HashPassword("correct horse battery");
        Assert.NotEqual(a, b);
        Assert.True(Accounts.VerifyPassword("correct horse battery", a));
        Assert.False(Accounts.VerifyPassword("correct horse batterY", a));
        Assert.False(Accounts.VerifyPassword("anything", "garbage"));
    }
}
