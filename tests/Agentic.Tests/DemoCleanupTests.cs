using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using Agentic.Api.Data;
using Agentic.Api.Services;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Agentic.Tests;

/// <summary>Removing the demo network keeps real accounts and everything that belongs only to them.</summary>
public sealed class DemoCleanupTests : IDisposable
{
    private readonly ApiFactory _factory = new();
    public void Dispose() => _factory.Dispose();

    [Fact]
    public async Task Removes_demo_members_and_their_data_and_keeps_real_accounts()
    {
        var real = _factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        var signup = await real.PostAsJsonAsync("/api/auth/signup", new { name = "Real Person", email = "real@example.org", password = "correct horse battery", headline = "Founder at Real Co", template = "investor", topics = new[] { "Inference" } });
        var address = (string)(await signup.Content.ReadFromJsonAsync<JsonObject>())!["agentAddress"]!;
        await real.PutAsJsonAsync("/api/profile", new { skills = new[] { "C#" } });

        // A knock from the real member to a demo member, and one from a stranger to the real member.
        string Pitch(string to) => System.Text.Json.JsonSerializer.Serialize(new
        {
            business_intent_version = "0.1", sender = new { display_name = "Lena Hoff" }, recipient = new { agent_address = to },
            intent = new { category = "fundraising", objective = "Meet about our pre-seed", requested_action = "meet", topics = new[] { "Inference" } },
        });
        (await real.PostAsync("/v1/intents", new StringContent(Pitch("maya.okafor@knockero"), Encoding.UTF8, "application/json"))).EnsureSuccessStatusCode();
        var kept = await _factory.CreateClient().PostAsync("/v1/intents", new StringContent(Pitch(address), Encoding.UTF8, "application/json"));
        var keptId = (string)(await kept.Content.ReadFromJsonAsync<JsonObject>())!["intent_id"]!;

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AgenticDb>();
            var result = await DemoCleanup.Run(db);
            Assert.True(result.Members > 10);
            Assert.True(result.Organizations > 0);
            Assert.Equal(["real-person"], await db.Members.Select(m => m.Id).ToListAsync());
            Assert.Empty(await db.Organizations.ToListAsync());
            Assert.Equal([keptId], await db.Intents.Select(i => i.Id).ToListAsync());
            Assert.DoesNotContain(await db.Relationships.ToListAsync(), r => r.MemberId != "real-person" || r.OtherId != "real-person");
            Assert.Single(await db.Policies.ToListAsync());
        }

        var boot = await real.GetFromJsonAsync<JsonObject>("/api/bootstrap");
        Assert.Equal(["real-person"], boot!["people"]!.AsObject().Select(p => p.Key).Where(k => !k.StartsWith("anon-")));
        Assert.Equal(["C#"], boot["people"]!["real-person"]!["skills"]!.AsArray().Select(s => (string)s!));
        Assert.Single(boot["intents"]!.AsArray());
        Assert.Empty(boot["orgs"]!.AsObject());
        Assert.Equal(HttpStatusCode.NotFound, (await _factory.CreateClient().GetAsync("/v1/agents/maya.okafor@knockero/card")).StatusCode);
    }
}
