using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using Agentic.Api.Data;
using Agentic.Api.Services;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Agentic.Tests;

/// <summary>Company pages: creating one, its own agent and inbox, acting as the company, admins, "works at".</summary>
public sealed class CompaniesTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private async Task<(HttpClient c, string id)> Person(string email, string name)
    {
        var c = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        var res = await c.PostAsJsonAsync("/api/auth/signup", new { name, email, password = "correct horse battery", headline = "Owner at Example", template = "founder" });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return (c, (string)(await res.Content.ReadFromJsonAsync<JsonObject>())!["id"]!);
    }

    private static async Task<JsonObject> CreateCompany(HttpClient c, string name, bool worksHere = true)
    {
        var res = await c.PostAsJsonAsync("/api/companies", new { name, tagline = "Hotel and home textiles, made to order", website = "linen.example.com", location = "Novi Sad", industries = new[] { "Manufacturing", "Not an industry" }, worksHere });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<JsonObject>())!;
    }

    private static HttpRequestMessage As(HttpMethod method, string url, string company, object? body = null)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Add("X-Act-As", company);
        if (body is not null) req.Content = JsonContent.Create(body);
        return req;
    }

    [Fact]
    public async Task A_member_creates_a_company_page_with_its_own_agent()
    {
        var (owner, ownerId) = await Person("owner@linen.example", "Owner Person");
        var created = await CreateCompany(owner, "Linen & Co");
        var id = (string)created["id"]!;
        Assert.Equal("linen-co", id);
        Assert.Equal("linen.co@knockero", (string)created["agentAddress"]!);

        var boot = await owner.GetFromJsonAsync<JsonObject>("/api/bootstrap");
        var company = boot!["people"]![id]!;
        Assert.Equal("company", (string)company["kind"]!);
        Assert.Equal("https://linen.example.com/", (string)company["website"]!);
        Assert.Equal(["Manufacturing"], company["topics"]!.AsArray().Select(t => (string)t!));
        Assert.Equal("Linen & Co", (string)boot["orgs"]![id]!["name"]!);
        Assert.Equal(id, (string)boot["people"]![ownerId]!["org"]!);   // "I work here"

        var mine = await owner.GetFromJsonAsync<JsonArray>("/api/companies/mine");
        Assert.Equal(id, (string)mine!.Single()!["id"]!);

        var card = await factory.CreateClient().GetFromJsonAsync<JsonObject>("/v1/agents/linen.co@knockero/card");
        Assert.NotNull(card);
    }

    [Fact]
    public async Task Admins_act_as_the_company_to_read_its_inbox_and_edit_its_page()
    {
        var (owner, ownerId) = await Person("boss@textile.example", "Boss Person");
        var id = (string)(await CreateCompany(owner, "Textile House"))["id"]!;
        var address = id.Replace('-', '.') + "@knockero";

        var knock = new
        {
            business_intent_version = "0.1", sender = new { display_name = "Hotel Adria" }, recipient = new { agent_address = address },
            intent = new { category = "purchase", objective = "Quote for 400 sets of bed linen", requested_action = "quote", topics = new[] { "Manufacturing" } },
            fit_evidence = new[] { new { type = "need", value = "400 sets by 1 May" }, new { type = "budget", value = "€12,000" } },
        };
        var sent = await factory.CreateClient().PostAsync("/v1/intents", new StringContent(System.Text.Json.JsonSerializer.Serialize(knock), Encoding.UTF8, "application/json"));
        var intentId = (string)(await sent.Content.ReadFromJsonAsync<JsonObject>())!["intent_id"]!;

        // The person's own inbox doesn't show it; acting as the company does.
        var personal = await owner.GetFromJsonAsync<JsonObject>("/api/bootstrap");
        Assert.DoesNotContain(personal!["intents"]!.AsArray(), i => (string)i!["id"]! == intentId);
        var asCompany = await (await owner.SendAsync(As(HttpMethod.Get, "/api/bootstrap", id))).Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal(id, (string)asCompany!["me"]!);
        Assert.Contains(asCompany["intents"]!.AsArray(), i => (string)i!["id"]! == intentId);
        Assert.Equal(1, (int)(await owner.GetFromJsonAsync<JsonArray>("/api/companies/mine"))!.Single()!["waiting"]!);

        // Edit the company page as the company: name, offers. The organization name follows.
        var edit = await owner.SendAsync(As(HttpMethod.Put, "/api/profile", id, new { name = "Textile House Ltd", offers = new[] { new { title = "Bed linen for hotels", description = "" } } }));
        Assert.Equal(HttpStatusCode.OK, edit.StatusCode);
        var after = await owner.GetFromJsonAsync<JsonObject>("/api/bootstrap");
        Assert.Equal("Textile House Ltd", (string)after!["orgs"]![id]!["name"]!);
        Assert.Equal("Bed linen for hotels", (string)after["people"]![id]!["offers"]![0]!["title"]!);
        // Personal things never run as the company.
        Assert.Equal(ownerId, (string)(await (await owner.SendAsync(As(HttpMethod.Get, "/api/session", id))).Content.ReadFromJsonAsync<JsonObject>())!["member"]!);

        // Someone who doesn't manage the page can't act as it.
        var (stranger, _) = await Person("stranger@elsewhere.example", "Stran Ger");
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.SendAsync(As(HttpMethod.Get, "/api/bootstrap", id))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.SendAsync(As(HttpMethod.Put, "/api/profile", id, new { name = "Hijacked" }))).StatusCode);
    }

    [Fact]
    public async Task Admins_can_add_and_remove_admins_but_never_the_last_one()
    {
        var (owner, ownerId) = await Person("first@admins.example", "First Admin");
        var id = (string)(await CreateCompany(owner, "Admin Test Co"))["id"]!;
        var (second, secondId) = await Person("second@admins.example", "Second Admin");

        Assert.Equal(HttpStatusCode.BadRequest, (await second.PostAsJsonAsync($"/api/companies/{id}/admins", new { email = "second@admins.example" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsJsonAsync($"/api/companies/{id}/admins", new { email = "nobody@admins.example" })).StatusCode);
        var added = await owner.PostAsJsonAsync($"/api/companies/{id}/admins", new { email = "Second@Admins.example" });
        Assert.Equal(2, (await added.Content.ReadFromJsonAsync<JsonArray>())!.Count);
        Assert.Equal(HttpStatusCode.OK, (await second.SendAsync(As(HttpMethod.Get, "/api/bootstrap", id))).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await second.DeleteAsync($"/api/companies/{id}/admins/{ownerId}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await second.DeleteAsync($"/api/companies/{id}/admins/{secondId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.SendAsync(As(HttpMethod.Get, "/api/bootstrap", id))).StatusCode);
    }

    [Fact]
    public async Task People_say_where_they_work_and_companies_show_up_in_find()
    {
        var (owner, _) = await Person("maker@find.example", "Maker Person");
        var id = (string)(await CreateCompany(owner, "Find Me Textiles", worksHere: false))["id"]!;
        (await owner.SendAsync(As(HttpMethod.Put, "/api/profile", id, new { offers = new[] { new { title = "Organic cotton towels", description = "" } } }))).EnsureSuccessStatusCode();

        var (worker, workerId) = await Person("worker@find.example", "Work Er");
        Assert.Equal(HttpStatusCode.BadRequest, (await worker.PutAsJsonAsync("/api/profile", new { worksAt = "no-such-company" })).StatusCode);
        var res = await worker.PutAsJsonAsync("/api/profile", new { worksAt = id });
        Assert.Equal(id, (string)(await res.Content.ReadFromJsonAsync<JsonObject>())!["people"]![workerId]!["org"]!);
        Assert.Null((await (await worker.PutAsJsonAsync("/api/profile", new { worksAt = "" })).Content.ReadFromJsonAsync<JsonObject>())!["people"]![workerId]!["org"]);

        var found = await worker.GetFromJsonAsync<JsonArray>("/api/directory?q=towels");
        Assert.Equal(id, (string)found![0]!["id"]!);
        Assert.Equal("company", (string)found[0]!["kind"]!);
    }

    [Fact]
    public async Task Removing_the_demo_keeps_real_company_pages()
    {
        var (owner, _) = await Person("keeper@demo.example", "Keep Er");
        var id = (string)(await CreateCompany(owner, "Real Company"))["id"]!;
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AgenticDb>();
        await DemoCleanup.Run(db);
        Assert.NotNull(await db.Organizations.FindAsync(id));
        Assert.NotNull(await db.Members.FindAsync(id));
        Assert.Equal(id, db.Members.Single(m => m.Email == "keeper@demo.example").OrgId);
    }
}
