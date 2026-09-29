using System.Text.Json;
using System.Text.Json.Nodes;
using Agentic.Api.Data;
using Agentic.Api.Domain;

namespace Agentic.Api.Services;

/// <summary>Seeds an empty database with the fictional demo network (Maya Okafor's inbox and everyone in it).</summary>
public static class DevSeed
{
    public static async Task RunAsync(AgentCore core, string demoJsonPath)
    {
        var db = core.Db;
        if (db.Members.Any()) return;

        var root = JsonNode.Parse(await File.ReadAllTextAsync(demoJsonPath))!.AsObject();
        var me = (string)root["me"]!;
        var ns = core.Catalog.AddressNamespace;
        var now = DateTime.UtcNow;

        foreach (var (id, node) in root["people"]!.AsObject())
        {
            var p = node!.AsObject();
            db.Members.Add(new Member
            {
                Id = id,
                Name = (string)p["name"]!,
                Kind = (string?)p["kind"] ?? "person",
                Headline = (string?)p["headline"] ?? "",
                OrgId = (string?)p["org"],
                AgentAddress = (string?)p["addr"] ?? id.Replace('-', '.') + "@" + ns,
                Reputation = (int?)p["rep"] ?? 50,
                AbuseFlags = (int?)p["abuse"] ?? 0,
                Verified = p["verified"] is JsonArray v ? v.Select(x => (string)x!).ToList() : [],
                Template = (string?)p["tpl"] ?? (id == me ? "investor" : "founder"),
                ProfileJson = p.ToJsonString(),
                CreatedAt = now,
            });
            // The demo's relationship numbers are symmetric: what Maya knows about them, they know about Maya.
            if (id != me && (p["mutuals"] is not null || p["degree"] is not null))
            {
                var mutuals = (int?)p["mutuals"] ?? 0;
                var prior = (int?)p["prior"] ?? 0;
                var degree = (string?)p["degree"] ?? "";
                db.Relationships.Add(new Relationship { MemberId = me, OtherId = id, Mutuals = mutuals, Prior = prior, Degree = degree });
                db.Relationships.Add(new Relationship { MemberId = id, OtherId = me, Mutuals = mutuals, Prior = prior, Degree = degree });
            }
        }

        foreach (var (id, node) in root["orgs"]!.AsObject())
        {
            var o = node!.AsObject();
            db.Organizations.Add(new Organization { Id = id, Name = (string)o["name"]!, Verified = (bool?)o["verified"] ?? false, ProfileJson = o.ToJsonString() });
        }
        await db.SaveChangesAsync();

        var myPolicy = core.Catalog.DefaultPolicy();
        var rec = new PolicyRecord { OwnerId = me };
        rec.Write(myPolicy);
        db.Policies.Add(rec);
        foreach (var m in db.Members.Where(m => m.Id != me).ToList())
        {
            var r = new PolicyRecord { OwnerId = m.Id };
            r.Write(core.Catalog.PolicyFromTemplate(m.Template, AgentCore.Topics(m)));
            db.Policies.Add(r);
        }
        await db.SaveChangesAsync();

        var people = root["people"]!.AsObject();
        foreach (var node in root["intents"]!.AsArray())
        {
            var d = node!.AsObject();
            var from = (string)d["from"]!;
            var received = now.AddMinutes(-((double?)d["ago"] ?? 0));
            var demo = new JsonObject();
            foreach (var key in new[] { "brief", "briefAfter", "suggest", "suggestAfter", "alt", "answers", "patch" })
                if (d[key] is not null) demo[key] = d[key]!.DeepClone();
            var it = new Intent
            {
                Id = (string)d["id"]!,
                RecipientId = me,
                SenderId = from,
                SenderName = (string?)people[from]?["name"] ?? from,
                Category = (string)d["category"]!,
                Tags = d["tags"] is JsonArray t ? t.Select(x => (string)x!).ToList() : [],
                Stage = (string?)d["stage"],
                Amount = (double?)d["amount"],
                Geo = (string?)d["geo"],
                Objective = (string?)d["objective"] ?? "",
                ValueProp = (string?)d["value"] ?? "",
                RequestedAction = (string?)d["action"] ?? "reply",
                Urgency = (string?)d["urgency"] ?? "normal",
                Deadline = (string?)d["deadline"],
                ValueScore = (double?)d["valueScore"],
                Templated = (int?)d["templated"],
                Generic = (int?)d["generic"] ?? 0,
                EvidenceJson = d["evidence"]?.ToJsonString() ?? "[]",
                Text = (string?)d["text"] ?? "",
                DemoJson = demo.Count > 0 ? demo.ToJsonString() : null,
                ReceivedAt = received,
                UpdatedAt = received,
            };
            // Normalise evidence JSON to the stored shape
            it.SetEvidence(JsonSerializer.Deserialize<List<EvidenceItem>>(it.EvidenceJson, Json.Web) ?? []);
            db.Intents.Add(it);
            if (d["thread"] is JsonArray thread)
                foreach (var m in thread)
                    core.Say(it, (string)m!["who"]! == "agent" ? "agent" : "sender", (string)m["who"]! == "agent" ? "question" : "answer", (string)m["t"]!, null, now.AddMinutes(-((double?)m["ago"] ?? 0)));
            await core.Reevaluate(it, myPolicy, "agent", forceLog: true);
        }
        await db.SaveChangesAsync();
    }
}
