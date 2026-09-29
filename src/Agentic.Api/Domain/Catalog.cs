using System.Text.Json;
using System.Text.Json.Nodes;

namespace Agentic.Api.Domain;

/// <summary>Domain definitions shared with the web client: categories, evidence types, claims, policy templates.</summary>
public sealed class Catalog
{
    public sealed record CategoryDef(string Label, string Desc);
    public sealed record EvidenceDef(string Label, string Q);
    public sealed record TemplateDef(string Name, JsonObject Policy);

    public string BrandName { get; }
    public string AddressNamespace { get; }
    public string ProtocolVersion { get; }
    public IReadOnlyDictionary<string, CategoryDef> Categories { get; }
    public IReadOnlyDictionary<string, EvidenceDef> Evidence { get; }
    public IReadOnlyDictionary<string, string> Claims { get; }
    public IReadOnlyList<string> Topics { get; }
    public IReadOnlyList<string> Stages { get; }
    public IReadOnlyList<string> Geos { get; }
    public IReadOnlyDictionary<string, TemplateDef> Templates { get; }
    private readonly string _defaultPolicyJson;

    public static readonly string[] Actions = ["meet", "reply", "intro", "review", "quote"];
    public static readonly string[] Urgencies = ["low", "normal", "time_sensitive"];
    public static readonly Dictionary<string, double> ValueByCategory = new()
    {
        ["fundraising"] = 0.7, ["intro"] = 0.6, ["partnership"] = 0.55, ["press"] = 0.4, ["advisory"] = 0.4,
        ["sales"] = 0.3, ["recruiting"] = 0.3, ["support"] = 0.3, ["other"] = 0.25,
    };

    public Catalog(string domainJsonPath)
    {
        var root = JsonNode.Parse(File.ReadAllText(domainJsonPath))!.AsObject();
        var brand = root["brand"]!.AsObject();
        BrandName = (string)brand["name"]!;
        AddressNamespace = (string)brand["ns"]!;
        ProtocolVersion = (string)brand["pv"]!;
        Categories = root["categories"]!.AsObject().ToDictionary(k => k.Key, k => new CategoryDef((string)k.Value!["label"]!, (string)k.Value!["desc"]!));
        Evidence = root["evidence"]!.AsObject().ToDictionary(k => k.Key, k => new EvidenceDef((string)k.Value!["label"]!, (string)k.Value!["q"]!));
        Claims = root["claims"]!.AsObject().ToDictionary(k => k.Key, k => (string)k.Value!);
        Topics = root["topics"]!.AsArray().Select(x => (string)x!).ToList();
        Stages = root["stages"]!.AsArray().Select(x => (string)x!).ToList();
        Geos = root["geos"]!.AsArray().Select(x => (string)x!).ToList();
        Templates = root["templates"]!.AsObject().ToDictionary(k => k.Key, k => new TemplateDef((string)k.Value!["name"]!, k.Value!["policy"]!.AsObject()));
        _defaultPolicyJson = root["defaultPolicy"]!.ToJsonString();
    }

    public PolicyDocument DefaultPolicy() => JsonSerializer.Deserialize<PolicyDocument>(_defaultPolicyJson, Json.Web)!;

    public string CategoryLabel(string category) => Categories.TryGetValue(category, out var c) ? c.Label : Categories["other"].Label;

    /// <summary>Policy for a member created from a template (the same rules the web client uses for other members).</summary>
    public PolicyDocument PolicyFromTemplate(string template, IEnumerable<string> topics)
    {
        var key = Templates.ContainsKey(template) ? template : "founder";
        var p = DefaultPolicy();
        ApplyTemplate(p, key);
        p.OpenTo = topics.ToList();
        p.Stages = Stages.ToList();
        p.Check = new CheckRange { Min = 0, Max = 1e12 };
        p.Geo = [];
        p.Vip = [];
        p.Blocked = ["guaranteed returns", "crypto yield"];
        p.ThesisHardFilter = false;
        p.Focus = false;
        p.RequireVerified = false;
        p.Version = 1;
        return p;
    }

    public void ApplyTemplate(PolicyDocument p, string template)
    {
        var t = Templates[template].Policy;
        p.Categories = t["categories"].Deserialize<Dictionary<string, string>>(Json.Web)!;
        p.Evidence = t["evidence"].Deserialize<Dictionary<string, List<string>>>(Json.Web)!;
        p.Thresholds = t["thresholds"].Deserialize<Thresholds>(Json.Web)!;
        p.ThesisHardFilter = (bool)t["thesisHardFilter"]!;
        p.Template = template;
    }
}
