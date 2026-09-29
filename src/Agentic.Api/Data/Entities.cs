using System.Text.Json;
using Agentic.Api.Domain;

namespace Agentic.Api.Data;

/// <summary>A person or an agent-only subject on the network. Every member owns one agent address.</summary>
public sealed class Member
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "person";
    public string Headline { get; set; } = "";
    public string? OrgId { get; set; }
    public string AgentAddress { get; set; } = "";
    public int Reputation { get; set; } = 50;
    public int AbuseFlags { get; set; }
    public List<string> Verified { get; set; } = [];
    public string Template { get; set; } = "founder";
    /// <summary>Profile fields the web client renders (colors, about, experience…), stored as a JSON document.</summary>
    public string ProfileJson { get; set; } = "{}";
    public DateTime CreatedAt { get; set; }
}

public sealed class Organization
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public bool Verified { get; set; }
    public string ProfileJson { get; set; } = "{}";
}

/// <summary>Directional edge: what <see cref="MemberId"/> knows about <see cref="OtherId"/>.</summary>
public sealed class Relationship
{
    public int Id { get; set; }
    public string MemberId { get; set; } = "";
    public string OtherId { get; set; } = "";
    public int Mutuals { get; set; }
    public int Prior { get; set; }
    public string Degree { get; set; } = "";
}

public sealed class PolicyRecord
{
    public string OwnerId { get; set; } = "";
    public int Version { get; set; }
    public string Json { get; set; } = "{}";
    public DateTime UpdatedAt { get; set; }

    public PolicyDocument Read() => JsonSerializer.Deserialize<PolicyDocument>(Json, Domain.Json.Web)!;
    public void Write(PolicyDocument doc)
    {
        Version = doc.Version;
        Json = JsonSerializer.Serialize(doc, Domain.Json.Web);
        UpdatedAt = DateTime.UtcNow;
    }
}

/// <summary>A Business Intent addressed to a recipient's agent, plus the recipient's current decision state.</summary>
public sealed class Intent
{
    public string Id { get; set; } = "";
    public string RecipientId { get; set; } = "";
    public string? SenderId { get; set; }
    public string SenderName { get; set; } = "";
    public string? SenderOrg { get; set; }

    public string Category { get; set; } = "other";
    public List<string> Tags { get; set; } = [];
    public string? Stage { get; set; }
    public double? Amount { get; set; }
    public string? Geo { get; set; }
    public string Objective { get; set; } = "";
    public string ValueProp { get; set; } = "";
    public string RequestedAction { get; set; } = "reply";
    public string Urgency { get; set; } = "normal";
    public string? Deadline { get; set; }
    public double? ValueScore { get; set; }
    public int? Templated { get; set; }
    public int Generic { get; set; }
    public string EvidenceJson { get; set; } = "[]";
    public string Text { get; set; } = "";
    public string? Note { get; set; }
    /// <summary>Seeded demo extras (brief, canned answers). Real intents get a generated brief.</summary>
    public string? DemoJson { get; set; }

    public DateTime ReceivedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string? SenderTokenHash { get; set; }

    // Latest agent evaluation (cache; the engine is the source of truth)
    public string Lane { get; set; } = Lanes.Medium;
    public int Score { get; set; }
    public int PolicyVersion { get; set; }

    // Recipient decision state
    public string? Status { get; set; }
    public string? LaneOverride { get; set; }
    public string? StatusDetail { get; set; }
    public string? AskedJson { get; set; }
    public bool Answered { get; set; }

    public List<EvidenceItem> GetEvidence() => JsonSerializer.Deserialize<List<EvidenceItem>>(EvidenceJson, Domain.Json.Web) ?? [];
    public void SetEvidence(IEnumerable<EvidenceItem> items) => EvidenceJson = JsonSerializer.Serialize(items.ToList(), Domain.Json.Web);
    public List<Question> GetAsked() => string.IsNullOrEmpty(AskedJson) ? [] : JsonSerializer.Deserialize<List<Question>>(AskedJson, Domain.Json.Web) ?? [];
    public string EffectiveLane => LaneOverride ?? Lane;
}

public sealed class IntentMessage
{
    public long Id { get; set; }
    public string IntentId { get; set; } = "";
    /// <summary>agent (recipient's agent), sender, or owner (the recipient in person).</summary>
    public string Who { get; set; } = "agent";
    /// <summary>question, answer, reply, decline, note.</summary>
    public string Kind { get; set; } = "note";
    public string Text { get; set; } = "";
    public string? EvidenceType { get; set; }
    public DateTime At { get; set; }
}

/// <summary>Append-only audit trail of every routing decision.</summary>
public sealed class DecisionLog
{
    public long Id { get; set; }
    public string IntentId { get; set; } = "";
    public string Lane { get; set; } = "";
    public int Score { get; set; }
    public string Action { get; set; } = "";
    public string Why { get; set; } = "";
    public int PolicyVersion { get; set; }
    public string Engine { get; set; } = "rules-1";
    public string Actor { get; set; } = "agent";
    public string AuditHash { get; set; } = "";
    public DateTime At { get; set; }
}

public sealed class AbuseReport
{
    public long Id { get; set; }
    public string IntentId { get; set; } = "";
    public string ReporterId { get; set; } = "";
    public string? SubjectId { get; set; }
    public string Reason { get; set; } = "";
    public DateTime At { get; set; }
}
