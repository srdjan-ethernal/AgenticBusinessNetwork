using System.Text.Json;
using System.Text.Json.Serialization;

namespace Agentic.Api.Domain;

public static class Json
{
    /// <summary>camelCase, used by the app API and for stored documents.</summary>
    public static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>snake_case, used by the public Business Intent Protocol.</summary>
    public static readonly JsonSerializerOptions Protocol = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}

/// <summary>A recipient's attention policy. Shape matches the web client's policy object.</summary>
public sealed class PolicyDocument
{
    public int Version { get; set; } = 1;
    public string Template { get; set; } = "founder";
    public List<string> OpenTo { get; set; } = [];
    public List<string> Stages { get; set; } = [];
    public CheckRange Check { get; set; } = new();
    public List<string> Geo { get; set; } = [];
    public Dictionary<string, string> Categories { get; set; } = [];
    public Dictionary<string, List<string>> Evidence { get; set; } = [];
    public Thresholds Thresholds { get; set; } = new();
    public bool ThesisHardFilter { get; set; }
    public bool RequireVerified { get; set; }
    public List<string> Vip { get; set; } = [];
    public List<string> Blocked { get; set; } = [];
    public Hours Hours { get; set; } = new();
    public bool Focus { get; set; }
    public Autonomy Autonomy { get; set; } = new();
    public PrivacySettings Privacy { get; set; } = new();
    public Weights Weights { get; set; } = new();

    public PolicyDocument Clone() => JsonSerializer.Deserialize<PolicyDocument>(JsonSerializer.Serialize(this, Json.Web), Json.Web)!;
}

public sealed class CheckRange
{
    public double Min { get; set; }
    public double Max { get; set; } = 1e12;
}

public sealed class Thresholds
{
    public int High { get; set; } = 75;
    public int Medium { get; set; } = 45;
}

public sealed class Hours
{
    public string Days { get; set; } = "Mon–Fri";
    public string Start { get; set; } = "09:00";
    public string End { get; set; } = "18:00";
    public string Tz { get; set; } = "CET";
}

public sealed class Autonomy
{
    public bool AutoDecline { get; set; } = true;
    public bool AutoQuestion { get; set; } = true;
    public bool Digest { get; set; } = true;
    public string DigestTime { get; set; } = "08:30";
    public bool Escalate { get; set; } = true;
    public bool ApproveScheduling { get; set; } = true;
    public bool NeverCommit { get; set; } = true;
}

public sealed class PrivacySettings
{
    public string Retention { get; set; } = "30";
    public bool Training { get; set; }
    public Dictionary<string, bool> Disclose { get; set; } = [];
}

public sealed class Weights
{
    public double Pf { get; set; } = 30;
    public double C { get; set; } = 20;
    public double R { get; set; } = 15;
    public double Rel { get; set; } = 15;
    public double V { get; set; } = 10;
    public double U { get; set; } = 10;
}

public sealed record EvidenceItem(string Type, string Value);

/// <summary>Everything the engine needs to know about an inbound intent.</summary>
public sealed class IntentFacts
{
    public string? From { get; set; }
    public string Category { get; set; } = "other";
    public List<string> Tags { get; set; } = [];
    public string? Stage { get; set; }
    public double? Amount { get; set; }
    public string? Geo { get; set; }
    public string Objective { get; set; } = "";
    public string Value { get; set; } = "";
    public string Action { get; set; } = "";
    public string Urgency { get; set; } = "normal";
    public string? Deadline { get; set; }
    public double? ValueScore { get; set; }
    public int? Templated { get; set; }
    public int Generic { get; set; }
    public List<EvidenceItem> Evidence { get; set; } = [];
    public string Text { get; set; } = "";
    public string? Note { get; set; }
}

/// <summary>What the recipient's agent knows about the sender, relative to the recipient.</summary>
public sealed class SenderFacts
{
    public string? Name { get; set; }
    public int? Rep { get; set; }
    public List<string> Verified { get; set; } = [];
    public int Abuse { get; set; }
    public int Mutuals { get; set; }
    public int Prior { get; set; }
}

public sealed record Reason(string Kind, string Text);
public sealed record ScorePart(string Key, string Label, double Weight, double Value);
public sealed record Penalty(string Label, int Points);
public sealed record Question(string Type, string Q);

public sealed class Evaluation
{
    public required string Lane { get; init; }
    public required int Score { get; init; }
    public required double Raw { get; init; }
    public required double PolicyFit { get; init; }
    public required List<ScorePart> Parts { get; init; }
    public required List<Penalty> Penalties { get; init; }
    public required List<Reason> Reasons { get; init; }
    public required string Why { get; init; }
    public required string Action { get; init; }
    public required List<string> Missing { get; init; }
    public required List<Question> Questions { get; init; }
    public required List<string> Overlap { get; init; }
    public required bool Vip { get; init; }
    public required string? Injection { get; init; }
    public required string CategoryStatus { get; init; }
    public required bool Verified { get; init; }
}

public static class Lanes
{
    public const string High = "high", Medium = "medium", Low = "low", Declined = "declined", Blocked = "blocked";
    public static readonly string[] All = [High, Medium, Low, Declined, Blocked];
    public static string Label(string lane) => lane switch
    {
        High => "HIGH",
        Medium => "MEDIUM",
        Low => "LOW",
        Declined => "Declined",
        _ => "Blocked",
    };
}
