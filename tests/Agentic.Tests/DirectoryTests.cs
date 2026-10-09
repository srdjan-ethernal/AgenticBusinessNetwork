using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Agentic.Tests;

/// <summary>Presenting a business (offers, needs, website) and finding others: search and matches.</summary>
public sealed class DirectoryTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private async Task<(HttpClient c, string id)> Member(string email, string name, string headline, string[] industries, object[] offers, object[] needs)
    {
        var c = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        var res = await c.PostAsJsonAsync("/api/auth/signup", new { name, email, password = "correct horse battery", headline, template = "founder", topics = industries });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var id = (string)(await res.Content.ReadFromJsonAsync<JsonObject>())!["id"]!;
        (await c.PutAsJsonAsync("/api/profile", new { offers, needs })).EnsureSuccessStatusCode();
        return (c, id);
    }

    [Fact]
    public async Task Offers_needs_and_website_are_saved_and_validated()
    {
        var (c, id) = await Member("shop@example.org", "Shop Owner", "Owner at Corner Shop", ["Retail & e-commerce"],
            [new { title = "Fresh bread every morning", description = "Delivered to cafés before 7:00" }, new { title = "", description = "" }], []);
        var me = (await c.GetFromJsonAsync<JsonObject>("/api/bootstrap"))!["people"]![id]!;
        Assert.Equal("Fresh bread every morning", (string)me["offers"]!.AsArray().Single()!["title"]!);

        var res = await c.PutAsJsonAsync("/api/profile", new { website = "cornershop.example.com" });
        Assert.Equal("https://cornershop.example.com/", (string)(await res.Content.ReadFromJsonAsync<JsonObject>())!["people"]![id]!["website"]!);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PutAsJsonAsync("/api/profile", new { website = "javascript:alert(1)" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PutAsJsonAsync("/api/profile", new { website = "not a site" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PutAsJsonAsync("/api/profile", new { needs = new[] { new { title = "", description = "Something without a title" } } })).StatusCode);
    }

    [Fact]
    public async Task Search_finds_what_people_offer_and_matches_needs_with_offers()
    {
        var (hotel, _) = await Member("hotel@example.org", "Hotel Adria", "Owner at Hotel Adria", ["Hospitality & tourism"],
            [new { title = "Rooms for business travellers", description = "Near the fair grounds" }],
            [new { title = "Bed linen for 180 rooms", description = "Before the summer season" }]);
        var (_, textileId) = await Member("textile@example.org", "Linen Works", "Head of sales at Linen Works", ["Manufacturing", "Fashion & beauty"],
            [new { title = "Bed linen and towels for hotels", description = "Cotton, made to order" }],
            [new { title = "Hotel partners on the coast", description = "" }]);
        await Member("lawyer@example.org", "Legal Eagle", "Lawyer", ["Legal & accounting"],
            [new { title = "Contracts and company registration", description = "" }], []);

        var byOffer = await hotel.GetFromJsonAsync<JsonArray>("/api/directory?q=linen");
        Assert.Equal(textileId, (string)byOffer![0]!["id"]!);
        Assert.Equal("Offers it", (string)byOffer[0]!["why"]!);
        Assert.DoesNotContain(byOffer, x => (string)x!["name"]! == "Legal Eagle");

        var byIndustry = await hotel.GetFromJsonAsync<JsonArray>("/api/directory?industry=" + Uri.EscapeDataString("Legal & accounting"));
        Assert.Equal("Legal Eagle", (string)byIndustry!.Single()!["name"]!);

        var matches = await hotel.GetFromJsonAsync<JsonArray>("/api/directory/matches");
        var top = matches![0]!;
        Assert.Equal(textileId, (string)top["id"]!);
        Assert.Equal("Offers what you need: Bed linen and towels for hotels", (string)top["why"]!);
        Assert.DoesNotContain(matches, x => (string)x!["name"]! == "Legal Eagle");

        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync("/api/directory?q=linen")).StatusCode);
    }
}
