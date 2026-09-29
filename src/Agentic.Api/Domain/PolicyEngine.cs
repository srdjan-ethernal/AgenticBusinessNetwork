using System.Globalization;
using System.Text.RegularExpressions;

namespace Agentic.Api.Domain;

/// <summary>
/// Recipient policy + priority scoring. Must stay in step with js/engine.js (parity is covered by tests).
/// Priority = 0.30 policy fit + 0.20 completeness + 0.15 reputation + 0.15 relationship + 0.10 value + 0.10 urgency − penalties.
/// Hard rules (blocked topics, closed categories, VIP bypass, thesis cap, injection quarantine) are enforced outside the score.
/// </summary>
public sealed partial class PolicyEngine(Catalog catalog)
{
    [GeneratedRegex(@"(ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)\s+(instructions|rules|prompts?))|(disregard\s+(your|the|all|any)\s+(policy|policies|rules|instructions))|(system\s+(prompt|note|message|override)\b)|(\byou\s+are\s+now\s+)|(mark\s+(this|it|me)\s+(message\s+)?(as\s+)?(high|urgent|vip)(\s+priority)?)|(new\s+instructions\s*:)", RegexOptions.IgnoreCase)]
    private static partial Regex InjectionRegex();

    [GeneratedRegex(@"\b(hope (this|you)[^.!?]{0,30}well|reach(ing)? out|touch base|synerg\w*|game-?changer|quick call|quick question|circle back|companies like yours|funds like yours|just checking in|unlock\w*|on autopilot|10x)\b", RegexOptions.IgnoreCase)]
    private static partial Regex GenericRegex();

    public static string? DetectInjection(string? text)
    {
        var m = InjectionRegex().Match(text ?? "");
        return m.Success ? m.Value : null;
    }

    public static int CountStockPhrases(string? text) => GenericRegex().Matches(text ?? "").Count;

    /// <summary>JavaScript's Math.round: floor(x + 0.5).</summary>
    private static double JsRound(double x) => Math.Floor(x + 0.5);
    private static double Clamp(double x) => Math.Max(0, Math.Min(1, x));

    public static string Money(double n)
    {
        if (n >= 1e6) return "$" + (JsRound(n / 1e6 * 10) / 10).ToString("0.#", CultureInfo.InvariantCulture) + "M";
        if (n >= 1e3) return "$" + JsRound(n / 1e3).ToString("0", CultureInfo.InvariantCulture) + "K";
        return "$" + n.ToString("0", CultureInfo.InvariantCulture);
    }

    /// <summary>Lower-cases a label for use mid-sentence, keeping leading acronyms (ICP, ROI).</summary>
    public static string Lc(string s) => s.Length >= 2 && char.IsUpper(s[0]) && char.IsUpper(s[1]) ? s : s.Length == 0 ? s : char.ToLowerInvariant(s[0]) + s[1..];

    public Evaluation Evaluate(IntentFacts it, PolicyDocument pol, SenderFacts p)
    {
        var who = !string.IsNullOrEmpty(p.Name) ? p.Name.Split(' ')[0] : "The sender";
        var text = string.Join(' ', it.Text, it.Objective, it.Value);
        var reasons = new List<Reason>();
        var catLabel = catalog.CategoryLabel(it.Category);
        var status = pol.Categories.TryGetValue(it.Category, out var st) ? st : "ask";
        var vip = !string.IsNullOrEmpty(it.From) && pol.Vip.Contains(it.From);
        var tags = it.Tags;
        var overlap = tags.Where(pol.OpenTo.Contains).ToList();
        var inj = DetectInjection(text);
        var lower = text.ToLowerInvariant();
        var blockedKw = pol.Blocked.FirstOrDefault(k => !string.IsNullOrEmpty(k) && lower.Contains(k.ToLowerInvariant()));
        var verified = p.Verified.Count > 0;
        var questions = new List<Question>();

        // 1. Policy fit
        double pf = status == "open" ? 0.4 : status == "ask" ? 0.25 : 0;
        if (pol.OpenTo.Count == 0) { pf += 0.25; reasons.Add(new("info", "No topic filter in this policy")); }
        else if (overlap.Count >= 2) { pf += 0.4; reasons.Add(new("pos", "Matches your topics: " + string.Join(", ", overlap))); }
        else if (overlap.Count == 1) { pf += 0.3; reasons.Add(new("pos", "Matches your topic: " + overlap[0])); }
        else { pf -= 0.1; reasons.Add(new("neg", tags.Count > 0 ? "Outside your topics: " + string.Join(", ", tags) : "No overlap with your topics")); }
        if (it.Category == "fundraising")
        {
            if (!string.IsNullOrEmpty(it.Stage))
            {
                if (pol.Stages.Contains(it.Stage)) { pf += 0.1; reasons.Add(new("pos", it.Stage + " is a stage you invest in")); }
                else { pf -= 0.1; reasons.Add(new("neg", it.Stage + " is outside your stages")); }
            }
            if (it.Amount is double amount && amount != 0)
            {
                double mn = pol.Check.Min, mx = pol.Check.Max;
                var rng = Money(mn) + "–" + Money(mx);
                if (amount >= mn && amount <= mx) { pf += 0.1; reasons.Add(new("pos", "Round of " + Money(amount) + (string.IsNullOrEmpty(it.Note) ? "" : " allocation") + " fits your " + rng + " range")); }
                else
                {
                    if (amount <= mx * 1.75 && amount >= mn * 0.5) { pf -= 0.05; reasons.Add(new("warn", "Round of " + Money(amount) + " is outside your " + rng + " range")); }
                    else { pf -= 0.2; reasons.Add(new("neg", "Round of " + Money(amount) + " is far outside your " + rng + " range")); }
                    questions.Add(new("round", "First checks here are " + rng + ". Is there an allocation in that range, and who leads?"));
                }
            }
        }
        else pf += 0.2;
        if (!string.IsNullOrEmpty(it.Geo) && pol.Geo.Count > 0 && !pol.Geo.Contains(it.Geo)) { pf -= 0.1; reasons.Add(new("warn", it.Geo + " is outside your geographies")); }
        pf = Clamp(pf);

        // 2. Intent completeness
        var fields = new[] { it.Objective, it.Value, it.Action }.Count(s => !string.IsNullOrEmpty(s)) / 3.0;
        var req = pol.Evidence.TryGetValue(it.Category, out var r) ? r : [];
        var have = it.Evidence.Select(e => e.Type).ToHashSet();
        var missing = req.Where(x => !have.Contains(x)).ToList();
        var ev = req.Count > 0 ? (req.Count - missing.Count) / (double)req.Count : 1;
        var c = 0.4 * fields + 0.6 * ev;
        if (req.Count > 0 && missing.Count == 0) reasons.Add(new("pos", "All required evidence is attached"));
        else if (missing.Count > 0) reasons.Add(new("warn", "Missing: " + string.Join(", ", missing.Select(m => Lc(catalog.Evidence.TryGetValue(m, out var d) ? d.Label : m)))));
        foreach (var m in missing)
            if (!questions.Any(q => q.Type == m)) questions.Add(new(m, catalog.Evidence.TryGetValue(m, out var d) ? d.Q : "Can you tell me more?"));

        // 3. Sender reputation
        var rep = (p.Rep ?? 50) / 100.0;
        if (!verified && pol.RequireVerified) { rep -= 0.2; reasons.Add(new("warn", "Sender identity is not verified")); }
        else if (verified) reasons.Add(new("pos", "Verified: " + string.Join(", ", p.Verified.Select(v => (catalog.Claims.TryGetValue(v, out var cl) ? cl : v).ToLowerInvariant()))));
        if (p.Abuse != 0) { rep -= 0.15 * p.Abuse; reasons.Add(new("neg", p.Abuse + " abuse report" + (p.Abuse > 1 ? "s" : "") + " in the last 30 days")); }
        rep = Clamp(rep);

        // 4. Relationship trust
        var rel = vip ? 1 : Clamp(Math.Min(1, p.Mutuals / 15.0) * 0.7 + Math.Min(1, p.Prior / 3.0) * 0.3);
        if (vip) reasons.Add(new("pos", who + " is on your VIP list"));
        else if (p.Mutuals >= 5) reasons.Add(new("pos", p.Mutuals + " mutual connections"));

        // 5–6. Business value and urgency
        var val = Clamp(it.ValueScore ?? 0.4);
        var urg = it.Urgency switch { "low" => 0.2, "time_sensitive" => 0.9, _ => 0.5 };
        if (it.Urgency == "time_sensitive") reasons.Add(new("info", "Time-sensitive" + (string.IsNullOrEmpty(it.Deadline) ? "" : ": " + it.Deadline)));

        // Penalties
        var pens = new List<Penalty>();
        if (inj is not null) pens.Add(new("Prompt-injection attempt", 45));
        if (it.Templated is int tpl && tpl != 0) pens.Add(new("Templated outreach (sent to " + tpl.ToString("N0", CultureInfo.InvariantCulture) + " recipients)", 12));
        else if (it.Generic >= 2) pens.Add(new("Templated phrasing (" + it.Generic + " stock phrases)", 10));
        if (p.Abuse != 0) pens.Add(new("Recent abuse reports", 8 * p.Abuse));
        if (blockedKw is not null) pens.Add(new("Blocked topic “" + blockedKw + "”", 30));
        var penalty = pens.Sum(x => x.Points);

        var w = pol.Weights;
        var parts = new List<ScorePart>
        {
            new("pf", "Policy fit", w.Pf, pf),
            new("c", "Intent completeness", w.C, c),
            new("r", "Sender reputation", w.R, rep),
            new("rel", "Relationship trust", w.Rel, rel),
            new("v", "Business value", w.V, val),
            new("u", "Urgency", w.U, urg),
        };
        var raw = 0.0;
        foreach (var part in parts) raw += part.Weight * part.Value;
        var score = (int)Math.Max(0, Math.Min(100, JsRound(raw - penalty)));
        var th = pol.Thresholds;

        string lane, why;
        if (inj is not null || p.Abuse >= 3) { lane = Lanes.Blocked; why = inj is not null ? "Prompt injection detected. The text was treated as data, quarantined, and the sender was rate-limited." : "Repeated abuse reports. The sender is blocked."; }
        else if (blockedKw is not null) { lane = Lanes.Declined; why = "Contains a blocked topic: “" + blockedKw + "”."; }
        else if (status == "closed" && !vip) { lane = Lanes.Declined; why = catLabel + " is closed in your policy. Declined automatically with a reason."; }
        else if (vip) { lane = Lanes.High; why = "VIP bypass: escalated regardless of score."; }
        else if (pol.ThesisHardFilter && it.Category == "fundraising" && pol.OpenTo.Count > 0 && overlap.Count == 0) { lane = Lanes.Low; why = "Outside your thesis. Your policy caps these at LOW."; }
        else if (score >= th.High && pf >= 0.6 && (!pol.RequireVerified || verified)) { lane = Lanes.High; why = "Score " + score + " clears your HIGH threshold of " + th.High + " and the policy check passed."; }
        else if (score >= th.High) { lane = Lanes.Medium; why = pf < 0.6 ? "Score is high, but policy fit is weak. Held for review." : "Score is high, but the sender is not verified."; }
        else if (score >= th.Medium) { lane = Lanes.Medium; why = missing.Count > 0 || questions.Count > 0 ? "Promising but incomplete. Qualification questions triggered." : "Score " + score + " sits between your MEDIUM (" + th.Medium + ") and HIGH (" + th.High + ") thresholds."; }
        else { lane = Lanes.Low; why = "Score " + score + " is below your MEDIUM threshold of " + th.Medium + "."; }
        if (pol.Focus && lane == Lanes.High && !vip) { lane = Lanes.Medium; why = "Focus mode is on. Held for your next digest; only VIPs interrupt you."; }

        var au = pol.Autonomy;
        var nq = questions.Count;
        var action = lane switch
        {
            Lanes.High => "Escalate to you with a brief",
            Lanes.Medium => nq > 0 && au.AutoQuestion ? "Ask " + nq + " qualification question" + (nq > 1 ? "s" : "") : au.Digest ? "Batch into your " + (string.IsNullOrEmpty(au.DigestTime) ? "08:30" : au.DigestTime) + " digest" : "Hold for review",
            Lanes.Low => au.AutoDecline ? "Decline politely with a reason" : "Archive quietly",
            Lanes.Declined => "Declined with a reason",
            _ => "Blocked and reported",
        };

        return new Evaluation
        {
            Lane = lane, Score = score, Raw = raw, PolicyFit = pf, Parts = parts, Penalties = pens, Reasons = reasons, Why = why, Action = action,
            Missing = missing, Questions = questions, Overlap = overlap, Vip = vip, Injection = inj, CategoryStatus = status, Verified = verified,
        };
    }
}
