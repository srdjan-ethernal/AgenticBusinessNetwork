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
    /// <summary>Sign-in email for real accounts; null for seeded demo members (development sign-in only).</summary>
    public string? Email { get; set; }
    public string? PasswordHash { get; set; }
    /// <summary>Google account id ("sub") for members who sign in with Google.</summary>
    public string? GoogleSubject { get; set; }
    /// <summary>The email address is confirmed (for now: Google said so).</summary>
    public bool EmailVerified { get; set; }
    /// <summary>Changes when the password is reset or the member signs out everywhere; older sessions stop working.</summary>
    public string? SecurityStamp { get; set; }
    /// <summary>Daily email digest of what the agent screened (sent at the start of the owner's working day).</summary>
    public bool DigestEnabled { get; set; } = true;
    public DateTime? LastDigestAt { get; set; }
    /// <summary>Lets the one-click link in a digest turn digests off without signing in.</summary>
    public string? DigestToken { get; set; }
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

    /// <summary>Model-written brief for the recipient: pending · ready · failed; null when there is none
    /// (demo intents, AI turned off, declined or blocked intents).</summary>
    public string? BriefStatus { get; set; }
    public string? BriefJson { get; set; }
    public string? BriefModel { get; set; }
    public DateTime? BriefAt { get; set; }
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

/// <summary>A connection a member imported (LinkedIn export) and may invite. Private to its owner.</summary>
public sealed class Contact
{
    public int Id { get; set; }
    public string OwnerId { get; set; } = "";
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string? Email { get; set; }
    public string? Company { get; set; }
    public string? Position { get; set; }
    public string? LinkedInUrl { get; set; }
    public string? ConnectedOn { get; set; }
    /// <summary>new · invited · joined · member (already on the network) · opted_out</summary>
    public string Status { get; set; } = "new";
    /// <summary>Single-use code in the invite link; lets the contact join even while sign-up is invite-only.</summary>
    public string? InviteCode { get; set; }
    public DateTime? InvitedAt { get; set; }
    public int InviteCount { get; set; }
    public string? JoinedMemberId { get; set; }
    public DateTime ImportedAt { get; set; }
}

/// <summary>Queued email, sent by <c>EmailDispatcher</c> in the background with throttling and retries.</summary>
public sealed class OutboundEmail
{
    public int Id { get; set; }
    public string Kind { get; set; } = "invite";
    public string? OwnerId { get; set; }
    public int? ContactId { get; set; }
    public string To { get; set; } = "";
    public string? ReplyTo { get; set; }
    public string FromName { get; set; } = "";
    public string Subject { get; set; } = "";
    public string Text { get; set; } = "";
    public string Html { get; set; } = "";
    public string? UnsubscribeUrl { get; set; }
    /// <summary>pending · sent · failed</summary>
    public string Status { get; set; } = "pending";
    public int Attempts { get; set; }
    public string? Error { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? SentAt { get; set; }
}

/// <summary>Addresses that asked not to receive invitations (SHA-256 of the lowercased address).</summary>
public sealed class EmailOptOut
{
    public string EmailHash { get; set; } = "";
    public DateTime CreatedAt { get; set; }
}

/// <summary>One language-model call: what it was for, who it was for, and what it cost.</summary>
public sealed class AiUsage
{
    public int Id { get; set; }
    public string Source { get; set; } = "";
    public string? MemberId { get; set; }
    public string Model { get; set; } = "";
    public int InputTokens { get; set; }
    public int OutputTokens { get; set; }
    public decimal CostUsd { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>Single-use link token sent by email (verify an address, reset a password). Only the hash is stored.</summary>
public sealed class EmailToken
{
    public int Id { get; set; }
    public string MemberId { get; set; } = "";
    /// <summary>verify · reset</summary>
    public string Purpose { get; set; } = "";
    public string TokenHash { get; set; } = "";
    public string Email { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? UsedAt { get; set; }
}

/// <summary>A member's profile photo (already resized in the browser, at most 1 MB). Served at /api/members/{id}/photo.</summary>
public sealed class MemberPhoto
{
    public string MemberId { get; set; } = "";
    public string ContentType { get; set; } = "image/jpeg";
    public byte[] Bytes { get; set; } = [];
    public DateTime UpdatedAt { get; set; }
}

/// <summary>Who may manage a company page: edit it, read its inbox and set its policy.</summary>
public sealed class OrgAdmin
{
    public string OrgId { get; set; } = "";
    public string MemberId { get; set; } = "";
    public DateTime AddedAt { get; set; }
}
