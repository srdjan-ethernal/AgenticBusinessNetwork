using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Agentic.Api.Data;
using Agentic.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Agentic.Api.Services;

/// <summary>Shared agent operations: policies, evaluation, audit log and thread messages.</summary>
public sealed class AgentCore(AgenticDb db, PolicyEngine engine, Catalog catalog)
{
    public AgenticDb Db => db;
    public Catalog Catalog => catalog;

    public async Task<PolicyDocument> PolicyFor(string memberId)
    {
        var rec = await db.Policies.FindAsync(memberId);
        if (rec is not null) return rec.Read();
        var m = await db.Members.FindAsync(memberId) ?? throw new InvalidOperationException("Unknown member " + memberId);
        var doc = catalog.PolicyFromTemplate(m.Template, Topics(m));
        var created = new PolicyRecord { OwnerId = memberId };
        created.Write(doc);
        db.Policies.Add(created);
        return doc;
    }

    public static List<string> Topics(Member m)
    {
        var node = JsonNode.Parse(m.ProfileJson)?["topics"];
        return node is JsonArray a ? a.Select(x => (string)x!).ToList() : [];
    }

    public static IntentFacts Facts(Intent it) => new()
    {
        From = it.SenderId,
        Category = it.Category,
        Tags = it.Tags.ToList(),
        Stage = it.Stage,
        Amount = it.Amount,
        Geo = it.Geo,
        Objective = it.Objective,
        Value = it.ValueProp,
        Action = it.RequestedAction,
        Urgency = it.Urgency,
        Deadline = it.Deadline,
        ValueScore = it.ValueScore,
        Templated = it.Templated,
        Generic = it.Generic,
        Evidence = it.GetEvidence(),
        Text = it.Text,
        Note = it.Answered ? it.Note : null,
    };

    public async Task<SenderFacts> SenderFor(Intent it)
    {
        if (it.SenderId is null) return new SenderFacts { Name = it.SenderName, Rep = 50 };
        var s = await db.Members.FindAsync(it.SenderId);
        if (s is null) return new SenderFacts { Name = it.SenderName, Rep = 50 };
        var rel = await db.Relationships.AsNoTracking().FirstOrDefaultAsync(r => r.MemberId == it.RecipientId && r.OtherId == it.SenderId);
        return new SenderFacts { Name = s.Name, Rep = s.Reputation, Verified = s.Verified.ToList(), Abuse = s.AbuseFlags, Mutuals = rel?.Mutuals ?? 0, Prior = rel?.Prior ?? 0 };
    }

    public async Task<Evaluation> Evaluate(Intent it, PolicyDocument? pol = null)
    {
        pol ??= await PolicyFor(it.RecipientId);
        return engine.Evaluate(Facts(it), pol, await SenderFor(it));
    }

    /// <summary>Re-scores an intent under the recipient's current policy and records the decision when it changes.</summary>
    public async Task<Evaluation> Reevaluate(Intent it, PolicyDocument? pol, string actor, bool forceLog = false)
    {
        pol ??= await PolicyFor(it.RecipientId);
        var ev = engine.Evaluate(Facts(it), pol, await SenderFor(it));
        var changed = ev.Lane != it.Lane || ev.Score != it.Score;
        it.Lane = ev.Lane;
        it.Score = ev.Score;
        it.PolicyVersion = pol.Version;
        it.UpdatedAt = DateTime.UtcNow;
        if (changed || forceLog) Log(it, ev.Lane, ev.Score, ev.Action, ev.Why, pol.Version, actor);
        return ev;
    }

    public void Log(Intent it, string lane, int score, string action, string why, int policyVersion, string actor)
    {
        var at = DateTime.UtcNow;
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{it.Id}|{lane}|{score}|{action}|{policyVersion}|{actor}|{at:O}")))[..16].ToLowerInvariant();
        db.Decisions.Add(new DecisionLog { IntentId = it.Id, Lane = lane, Score = score, Action = action, Why = why, PolicyVersion = policyVersion, Actor = actor, AuditHash = hash, At = at });
    }

    public void Say(Intent it, string who, string kind, string text, string? evidenceType = null, DateTime? at = null) =>
        db.Messages.Add(new IntentMessage { IntentId = it.Id, Who = who, Kind = kind, Text = text, EvidenceType = evidenceType, At = at ?? DateTime.UtcNow });

    public void SetAsked(Intent it, IEnumerable<Question> questions) =>
        it.AskedJson = JsonSerializer.Serialize(questions.ToList(), Json.Web);

    /// <summary>Questions the agent asked that the sender has not answered yet.</summary>
    public static List<Question> OpenQuestions(Intent it, IEnumerable<IntentMessage> messages)
    {
        var answered = messages.Where(m => m.Who == "sender" && m.Kind == "answer" && m.EvidenceType != null).Select(m => m.EvidenceType!).ToHashSet();
        return it.GetAsked().Where(q => !answered.Contains(q.Type)).ToList();
    }

    public static string NewIntentId() => "bi_" + Guid.CreateVersion7().ToString("N")[..24];

    public static string NewToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static string HashToken(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
}
