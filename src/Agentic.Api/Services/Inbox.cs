using System.Text.Json;
using System.Text.Json.Nodes;
using Agentic.Api.Data;
using Agentic.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Agentic.Api.Services;

/// <summary>The recipient's side: bootstrap data for the web client, policy updates and inbox actions.</summary>
public sealed class Inbox(AgentCore core, Protocol protocol)
{
    private AgenticDb Db => core.Db;

    public static readonly string[] Statuses = ["replied", "scheduled", "held", "declined", "archived", "reported", "intro", "delegated"];

    public async Task<JsonObject> Bootstrap(string meId)
    {
        var me = await Db.Members.FindAsync(meId) ?? throw new KeyNotFoundException();
        var policy = await core.PolicyFor(meId);
        var rels = await Db.Relationships.AsNoTracking().Where(r => r.MemberId == meId).ToDictionaryAsync(r => r.OtherId);

        var people = new JsonObject();
        foreach (var m in await Db.Members.AsNoTracking().ToListAsync())
            people[m.Id] = PersonJson(m, m.Id == meId ? null : rels.GetValueOrDefault(m.Id));
        var orgs = new JsonObject();
        foreach (var o in await Db.Organizations.AsNoTracking().ToListAsync())
            orgs[o.Id] = JsonNode.Parse(o.ProfileJson);

        var inbound = (await Db.Intents.AsNoTracking().Where(i => i.RecipientId == meId).ToListAsync()).OrderByDescending(i => i.ReceivedAt).ToList();
        var ids = inbound.Select(i => i.Id).ToList();
        var messages = (await Db.Messages.AsNoTracking().Where(m => ids.Contains(m.IntentId)).ToListAsync()).GroupBy(m => m.IntentId).ToDictionary(g => g.Key, g => g.OrderBy(m => m.At).ToList());

        var intents = new JsonArray();
        var decisions = new JsonObject();
        var answered = new JsonObject();
        foreach (var it in inbound)
        {
            if (it.SenderId is null) people[AnonId(it)] = AnonJson(it);
            var ev = await core.Evaluate(it, policy);
            intents.Add(IntentJson(it, ev, messages.GetValueOrDefault(it.Id) ?? []));
            var d = DecisionJson(it);
            if (d is not null) decisions[it.Id] = d;
            if (it.Answered) answered[it.Id] = true;
        }

        var sent = new JsonArray();
        foreach (var it in (await Db.Intents.AsNoTracking().Where(i => i.SenderId == meId).ToListAsync()).OrderByDescending(i => i.ReceivedAt))
        {
            var view = await protocol.View(it, includeToken: null);
            sent.Add(new JsonObject
            {
                ["id"] = it.Id,
                ["to"] = it.RecipientId,
                ["objective"] = it.Objective,
                ["category"] = it.Category,
                ["status"] = view.Status,
                ["reason"] = view.DeclineReason,
                ["openQuestions"] = view.OpenQuestions.Count,
                ["when"] = Ago(it.ReceivedAt),
            });
        }

        var stats = new JsonObject
        {
            ["views"] = 0,
            ["triaged"] = inbound.Count,
            ["reached"] = inbound.Count(i => i.EffectiveLane == Lanes.High),
            ["saved"] = Math.Round(inbound.Count * 1.8 / 60, 1),
            ["appearances"] = 0,
        };
        if (meId == "maya-okafor")
        {
            stats["views"] = 128; stats["triaged"] = 214; stats["reached"] = 9; stats["saved"] = 6.4; stats["appearances"] = 57;
        }

        return new JsonObject
        {
            ["me"] = meId,
            ["people"] = people,
            ["orgs"] = orgs,
            ["intents"] = intents,
            ["policy"] = JsonSerializer.SerializeToNode(policy, Json.Web),
            ["decisions"] = decisions,
            ["answered"] = answered,
            ["sent"] = sent,
            ["stats"] = stats,
            ["account"] = new JsonObject { ["email"] = me.Email, ["emailVerified"] = me.EmailVerified },
        };
    }

    public static JsonObject PersonJson(Member m, Relationship? rel)
    {
        var p = JsonNode.Parse(m.ProfileJson) as JsonObject ?? [];
        p["name"] = m.Name;
        p["headline"] = m.Headline;
        p["kind"] = m.Kind == "person" ? null : m.Kind;
        p["org"] = m.OrgId;
        p["addr"] = m.AgentAddress;
        p["rep"] = m.Reputation;
        p["abuse"] = m.AbuseFlags == 0 ? null : m.AbuseFlags;
        p["verified"] = new JsonArray(m.Verified.Select(v => (JsonNode)v).ToArray());
        p["tpl"] = m.Template;
        p["mutuals"] = rel?.Mutuals ?? 0;
        p["prior"] = rel?.Prior ?? 0;
        p["degree"] = rel?.Degree ?? "";
        if (p["c"] is null) p["c"] = new JsonArray("#56687a", "#9db3c8");
        return p;
    }

    public static string AnonId(Intent it) => "anon-" + it.Id;

    private static JsonObject AnonJson(Intent it) => new()
    {
        ["name"] = it.SenderName,
        ["headline"] = "Unregistered sender" + (string.IsNullOrWhiteSpace(it.SenderOrg) ? "" : " · " + it.SenderOrg),
        ["loc"] = "Unknown",
        ["rep"] = 50,
        ["verified"] = new JsonArray(),
        ["mutuals"] = 0,
        ["prior"] = 0,
        ["degree"] = "",
        ["c"] = new JsonArray("#56687a", "#9db3c8"),
    };

    private JsonObject IntentJson(Intent it, Evaluation ev, List<IntentMessage> messages)
    {
        var demo = string.IsNullOrEmpty(it.DemoJson) ? null : JsonNode.Parse(it.DemoJson) as JsonObject;
        var o = new JsonObject
        {
            ["id"] = it.Id,
            ["from"] = it.SenderId ?? AnonId(it),
            ["category"] = it.Category,
            ["tags"] = new JsonArray(it.Tags.Select(t => (JsonNode)t).ToArray()),
            ["stage"] = it.Stage,
            ["amount"] = it.Amount,
            ["geo"] = it.Geo,
            ["ago"] = Math.Max(0, (int)(DateTime.UtcNow - it.ReceivedAt).TotalMinutes),
            ["urgency"] = it.Urgency,
            ["deadline"] = it.Deadline,
            ["valueScore"] = it.ValueScore,
            ["templated"] = it.Templated,
            ["generic"] = it.Generic,
            ["action"] = it.RequestedAction,
            ["objective"] = it.Objective,
            ["value"] = it.ValueProp,
            ["evidence"] = JsonSerializer.SerializeToNode(it.GetEvidence(), Json.Web),
            ["text"] = it.Text,
            ["note"] = it.Answered ? it.Note : null,
            ["serverLane"] = ev.Lane,
            ["serverScore"] = ev.Score,
            ["thread"] = new JsonArray(messages.Select(m => (JsonNode)new JsonObject
            {
                ["who"] = m.Who,
                ["t"] = m.Text,
                ["ago"] = Math.Max(0, (int)(DateTime.UtcNow - m.At).TotalMinutes),
            }).ToArray()),
        };
        if (demo is not null)
        {
            foreach (var key in new[] { "brief", "briefAfter", "suggest", "suggestAfter", "alt" })
                if (demo[key] is not null) o[key] = demo[key]!.DeepClone();
        }
        else if (Briefs.Read(it) is { } ai)
        {
            o["brief"] = new JsonArray(ai.Bullets.Select(b => (JsonNode)b).ToArray());
            o["suggest"] = ai.NextStep;
            o["replyDraft"] = ai.ReplyDraft;
            o["briefBy"] = it.BriefModel;
        }
        else
        {
            o["brief"] = new JsonArray(GeneratedBrief(it, ev).Select(b => (JsonNode)b).ToArray());
            o["suggest"] = ev.Action;
            if (it.BriefStatus == "pending") o["briefPending"] = true;
        }
        return o;
    }

    /// <summary>A deterministic brief for intents that did not come with one. (Model-written briefs come later.)</summary>
    private List<string> GeneratedBrief(Intent it, Evaluation ev)
    {
        var list = new List<string> { core.Catalog.CategoryLabel(it.Category) + " from " + it.SenderName + (string.IsNullOrWhiteSpace(it.SenderOrg) ? "" : " (" + it.SenderOrg + ")") + ": " + it.Objective };
        if (!string.IsNullOrWhiteSpace(it.ValueProp)) list.Add(it.ValueProp);
        var ev1 = it.GetEvidence().Take(2).Select(e => (core.Catalog.Evidence.TryGetValue(e.Type, out var d) ? d.Label : e.Type) + ": " + e.Value);
        list.AddRange(ev1);
        if (ev.Missing.Count > 0) list.Add("Missing: " + string.Join(", ", ev.Missing.Select(m => PolicyEngine.Lc(core.Catalog.Evidence.TryGetValue(m, out var d) ? d.Label : m))) + ".");
        return list;
    }

    private static JsonObject? DecisionJson(Intent it)
    {
        if (it.Status is null && it.LaneOverride is null && it.AskedJson is null) return null;
        var o = new JsonObject
        {
            ["status"] = it.Status,
            ["lane"] = it.LaneOverride,
            ["detail"] = it.StatusDetail,
        };
        if (it.AskedJson is not null) o["asked"] = JsonNode.Parse(it.AskedJson);
        return o;
    }

    public static string Ago(DateTime at)
    {
        var min = (DateTime.UtcNow - at).TotalMinutes;
        if (min < 1) return "now";
        if (min < 60) return (int)min + "m";
        if (min < 1440) return (int)(min / 60) + "h";
        return (int)(min / 1440) + "d";
    }

    // ---------- policy ----------

    public async Task<(PolicyDocument? doc, string? error)> SavePolicy(string meId, PolicyDocument incoming)
    {
        var error = Validate(incoming);
        if (error is not null) return (null, error);
        var rec = await Db.Policies.FindAsync(meId);
        var current = rec?.Read() ?? await core.PolicyFor(meId);
        incoming.Version = current.Version + 1;
        rec ??= Db.Policies.Local.FirstOrDefault(p => p.OwnerId == meId);
        if (rec is null) { rec = new PolicyRecord { OwnerId = meId }; Db.Policies.Add(rec); }
        rec.Write(incoming);
        foreach (var it in await Db.Intents.Where(i => i.RecipientId == meId).ToListAsync())
            await core.Reevaluate(it, incoming, "policy");
        await Db.SaveChangesAsync();
        return (incoming, null);
    }

    private string? Validate(PolicyDocument p)
    {
        if (p.Thresholds.High is < 50 or > 95) return "The HIGH threshold must be between 50 and 95.";
        if (p.Thresholds.Medium < 10 || p.Thresholds.Medium > p.Thresholds.High - 5) return "The MEDIUM threshold must be at least 10 and at least 5 below HIGH.";
        foreach (var (cat, status) in p.Categories)
        {
            if (!core.Catalog.Categories.ContainsKey(cat)) return "Unknown category: " + cat;
            if (status is not ("open" or "ask" or "closed")) return "Category status must be open, ask or closed.";
        }
        foreach (var (cat, list) in p.Evidence)
        {
            if (!core.Catalog.Categories.ContainsKey(cat)) return "Unknown category: " + cat;
            if (list.Any(e => !core.Catalog.Evidence.ContainsKey(e))) return "Unknown evidence type in " + cat + ".";
        }
        if (p.Check.Min < 0 || p.Check.Max < p.Check.Min) return "The check range is invalid.";
        if (!core.Catalog.Templates.ContainsKey(p.Template)) return "Unknown template: " + p.Template;
        if (p.OpenTo.Count > 40 || p.Blocked.Count > 100 || p.Vip.Count > 200) return "Too many entries in the policy.";
        return null;
    }

    // ---------- inbox actions ----------

    public async Task<Intent?> Find(string meId, string id) =>
        await Db.Intents.FirstOrDefaultAsync(i => i.Id == id && i.RecipientId == meId);

    /// <summary>Your agent asks the sender's agent for what is missing. Demo senders answer from their script.</summary>
    public async Task<(bool ok, string? error)> Ask(string meId, Intent it)
    {
        var policy = await core.PolicyFor(meId);
        var ev = await core.Evaluate(it, policy);
        if (ev.Questions.Count == 0) return (false, "There is nothing to ask. The intent already has everything your policy requires.");
        core.SetAsked(it, ev.Questions);
        foreach (var q in ev.Questions) core.Say(it, "agent", "question", q.Q, q.Type);
        core.Log(it, ev.Lane, ev.Score, "Asked " + ev.Questions.Count + " qualification question" + (ev.Questions.Count > 1 ? "s" : ""), ev.Why, policy.Version, meId);

        var demo = string.IsNullOrEmpty(it.DemoJson) ? null : JsonNode.Parse(it.DemoJson) as JsonObject;
        if (demo?["answers"] is JsonObject answers)
        {
            foreach (var q in ev.Questions)
                if (answers[q.Type] is JsonNode a) core.Say(it, "sender", "answer", (string)a!, q.Type);
            if (demo["patch"] is JsonObject patch)
            {
                if (patch["amount"] is JsonNode amt) it.Amount = (double)amt;
                if (patch["evidence"] is JsonArray more)
                    it.SetEvidence(it.GetEvidence().Concat(more.Deserialize<List<EvidenceItem>>(Json.Web) ?? []));
                it.Note = (string?)patch["note"];
            }
            it.Answered = true;
            await core.Reevaluate(it, policy, "agent", forceLog: true);
        }
        it.UpdatedAt = DateTime.UtcNow;
        await Db.SaveChangesAsync();
        return (true, null);
    }

    public async Task<(bool ok, string? error)> Act(string meId, Intent it, string action, string? text, string? detail)
    {
        var policy = await core.PolicyFor(meId);
        var ev = await core.Evaluate(it, policy);
        text = string.IsNullOrWhiteSpace(text) ? null : text.Trim();
        if (text?.Length > 4000) return (false, "The message is too long.");
        switch (action)
        {
            case "escalate": it.LaneOverride = Lanes.High; it.Status = null; it.StatusDetail = null; break;
            case "review": it.LaneOverride = Lanes.Medium; it.Status = null; it.StatusDetail = null; break;
            case "hold": it.Status = "held"; it.StatusDetail = detail ?? "It will appear in your next digest."; break;
            case "archive": it.Status = "archived"; it.StatusDetail = detail ?? "No reply sent."; break;
            case "reply":
                it.Status = "replied"; it.StatusDetail = detail ?? "Delivered to " + it.SenderName + "’s agent.";
                if (text is not null) core.Say(it, "owner", "reply", text);
                break;
            case "schedule":
                it.Status = "scheduled"; it.StatusDetail = detail ?? "Time proposed.";
                core.Say(it, "owner", "reply", text ?? it.StatusDetail);
                break;
            case "delegate": it.Status = "delegated"; it.StatusDetail = detail ?? "Delegated to a teammate."; break;
            case "intro": it.Status = "intro"; it.StatusDetail = detail ?? "Opt-in requests sent."; if (text is not null) core.Say(it, "owner", "reply", text); break;
            case "decline":
                it.Status = "declined"; it.StatusDetail = detail ?? "Reason delivered to " + it.SenderName + "’s agent.";
                core.Say(it, "owner", "decline", text ?? "Thanks for reaching out. This isn’t a match right now.");
                break;
            case "report":
                it.Status = "reported"; it.StatusDetail = detail ?? "Reputation lowered and a network-wide rate limit applied.";
                Db.AbuseReports.Add(new AbuseReport { IntentId = it.Id, ReporterId = meId, SubjectId = it.SenderId, Reason = text ?? "Reported from the inbox", At = DateTime.UtcNow });
                if (it.SenderId is not null && await Db.Members.FindAsync(it.SenderId) is Member sender)
                {
                    sender.AbuseFlags += 1;
                    sender.Reputation = Math.Max(0, sender.Reputation - 5);
                }
                break;
            case "undo": it.Status = null; it.LaneOverride = null; it.StatusDetail = null; break;
            default: return (false, "Unknown action: " + action);
        }
        it.UpdatedAt = DateTime.UtcNow;
        core.Log(it, it.LaneOverride ?? ev.Lane, ev.Score, action, it.StatusDetail ?? ev.Why, policy.Version, meId);
        await Db.SaveChangesAsync();
        return (true, null);
    }

    public async Task<(bool ok, string? error)> SetLane(string meId, Intent it, string lane)
    {
        if (!Lanes.All.Contains(lane)) return (false, "Unknown lane.");
        var policy = await core.PolicyFor(meId);
        it.LaneOverride = lane == it.Lane ? null : lane;
        it.Status = null;
        it.StatusDetail = null;
        it.UpdatedAt = DateTime.UtcNow;
        core.Log(it, lane, it.Score, "Moved by recipient", "Recipient feedback", policy.Version, meId);
        await Db.SaveChangesAsync();
        return (true, null);
    }
}
