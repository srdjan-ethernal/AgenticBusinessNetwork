using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Agentic.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Agentic.Api.Services;

/// <summary>Find people and businesses: search by what they do, offer and look for, and match what one
/// member needs with what another offers. Works on member profiles, so it needs no extra tables.</summary>
public sealed partial class MemberDirectory(AgenticDb db)
{
    public sealed record Card(string Id, string Kind, string Name, string Headline, JsonNode? Photo, JsonNode? Colors, string? Location,
        List<string> Industries, List<string> Offers, List<string> Needs, string? Website, int Score, string? Why);

    private sealed record Profile(Member Member, JsonObject P, string Text, HashSet<string> OfferWords, HashSet<string> NeedWords);

    [GeneratedRegex(@"[\p{L}\p{N}]+")]
    private static partial Regex Word();

    private static readonly HashSet<string> Stop = new(StringComparer.OrdinalIgnoreCase)
    {
        "and", "the", "for", "with", "our", "your", "you", "are", "from", "that", "this", "all", "any", "new", "who", "can", "per",
        "services", "service", "products", "product", "solutions", "company", "companies", "business", "businesses", "looking",
    };

    public async Task<List<Card>> Search(string meId, string? query, string? industry, int take = 50)
    {
        var q = Words(query);
        var people = await Load(meId);
        var hits = new List<Card>();
        foreach (var x in people)
        {
            var industries = Strings(x.P["topics"]);
            if (!string.IsNullOrEmpty(industry) && !industries.Contains(industry)) continue;
            int score = 0;
            string? why = null;
            if (q.Count > 0)
            {
                foreach (var w in q)
                {
                    if (x.OfferWords.Any(o => o.StartsWith(w, StringComparison.OrdinalIgnoreCase))) { score += 4; why ??= "Offers it"; }
                    if (x.NeedWords.Any(o => o.StartsWith(w, StringComparison.OrdinalIgnoreCase))) { score += 3; why ??= "Looking for it"; }
                    if (x.Member.Name.Contains(w, StringComparison.OrdinalIgnoreCase)) { score += 5; why ??= "Name"; }
                    if (x.Member.Headline.Contains(w, StringComparison.OrdinalIgnoreCase)) { score += 3; why ??= "Headline"; }
                    if (industries.Any(i => i.Contains(w, StringComparison.OrdinalIgnoreCase))) { score += 2; why ??= "Industry"; }
                    if (x.Text.Contains(w, StringComparison.OrdinalIgnoreCase)) score += 1;
                }
                if (score == 0) continue;
            }
            hits.Add(ToCard(x, score, q.Count > 0 ? why : null));
        }
        return hits.OrderByDescending(h => h.Score).ThenByDescending(h => h.Offers.Count + h.Needs.Count).ThenBy(h => h.Name).Take(take).ToList();
    }

    /// <summary>Who offers what you need, and who needs what you offer, best first.</summary>
    public async Task<List<Card>> Matches(string meId, int take = 12)
    {
        var me = await db.Members.AsNoTracking().FirstOrDefaultAsync(m => m.Id == meId);
        if (me is null) return [];
        var mine = Parse(me);
        if (mine.OfferWords.Count == 0 && mine.NeedWords.Count == 0) return [];
        var myIndustries = Strings(mine.P["topics"]).ToHashSet();
        var cards = new List<Card>();
        foreach (var x in await Load(meId))
        {
            var theyOffer = Overlap(mine.NeedWords, x.OfferWords);
            var theyNeed = Overlap(mine.OfferWords, x.NeedWords);
            if (theyOffer.Count == 0 && theyNeed.Count == 0) continue;
            var shared = Strings(x.P["topics"]).Count(myIndustries.Contains);
            var score = theyOffer.Count * 3 + theyNeed.Count * 3 + shared;
            var why = theyOffer.Count > 0
                ? "Offers what you need: " + Title(x.P["offers"], theyOffer)
                : "Looking for what you offer: " + Title(x.P["needs"], theyNeed);
            cards.Add(ToCard(x, score, why));
        }
        return cards.OrderByDescending(c => c.Score).ThenBy(c => c.Name).Take(take).ToList();
    }

    private async Task<List<Profile>> Load(string meId)
    {
        var members = await db.Members.AsNoTracking().Where(m => m.Id != meId && (m.Kind == "person" || m.Kind == "company")).ToListAsync();
        return members.Select(Parse).ToList();
    }

    private static Profile Parse(Member m)
    {
        var p = JsonNode.Parse(m.ProfileJson) as JsonObject ?? [];
        string Items(string key) => string.Join(" ", (p[key] as JsonArray ?? []).Select(i => (string?)i?["title"] + " " + (string?)i?["desc"]));
        var text = string.Join(" ", m.Name, m.Headline, (string?)p["about"], (string?)p["loc"], Items("offers"), Items("needs"),
            string.Join(" ", Strings(p["skills"])), string.Join(" ", Strings(p["topics"])),
            string.Join(" ", (p["exp"] as JsonArray ?? []).Select(e => (string?)e?["title"] + " " + (string?)e?["company"])));
        return new Profile(m, p, text, Words(Items("offers")), Words(Items("needs")));
    }

    private static Card ToCard(Profile x, int score, string? why) => new(
        x.Member.Id, x.Member.Kind, x.Member.Name, x.Member.Headline, x.P["photo"]?.DeepClone(), x.P["c"]?.DeepClone(), (string?)x.P["loc"],
        Strings(x.P["topics"]), Titles(x.P["offers"]), Titles(x.P["needs"]), (string?)x.P["website"], score, why);

    private static HashSet<string> Words(string? text) =>
        Word().Matches(text ?? "").Select(m => m.Value.ToLowerInvariant()).Where(w => w.Length >= 3 && !Stop.Contains(w))
            .Select(Stem).ToHashSet();

    /// <summary>Crude English stemming so "printing" meets "print" and "hotels" meets "hotel".</summary>
    private static string Stem(string w)
    {
        foreach (var suffix in new[] { "ing", "ers", "er", "es", "s" })
            if (w.Length > suffix.Length + 3 && w.EndsWith(suffix)) return w[..^suffix.Length];
        return w;
    }

    private static List<string> Overlap(HashSet<string> a, HashSet<string> b) => a.Where(b.Contains).ToList();

    private static string Title(JsonNode? items, List<string> words)
    {
        var titles = items as JsonArray ?? [];
        foreach (var i in titles)
        {
            var t = (string?)i?["title"] ?? "";
            if (Words(t + " " + (string?)i?["desc"]).Overlaps(words)) return t;
        }
        return (string?)titles.FirstOrDefault()?["title"] ?? "";
    }

    private static List<string> Titles(JsonNode? items) => (items as JsonArray ?? []).Select(i => (string?)i?["title"]).OfType<string>().ToList();
    private static List<string> Strings(JsonNode? arr) => (arr as JsonArray ?? []).Select(x => x is JsonValue v && v.TryGetValue<string>(out var s) ? s : null).OfType<string>().ToList();
}
