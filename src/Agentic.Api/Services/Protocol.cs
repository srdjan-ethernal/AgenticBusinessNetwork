using Agentic.Api.Data;
using Agentic.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Agentic.Api.Services;

// ---------- wire types (snake_case on the wire) ----------

public sealed class IntentSubmission
{
    public string? BusinessIntentVersion { get; set; }
    public SubmissionSender? Sender { get; set; }
    public SubmissionRecipient? Recipient { get; set; }
    public SubmissionIntent? Intent { get; set; }
    public List<SubmissionEvidence>? FitEvidence { get; set; }
    public string? Message { get; set; }
}
public sealed class SubmissionSender { public string? DisplayName { get; set; } public string? Organization { get; set; } }
public sealed class SubmissionRecipient { public string? AgentAddress { get; set; } }
public sealed class SubmissionIntent
{
    public string? Category { get; set; }
    public string? Objective { get; set; }
    public string? ValueProposition { get; set; }
    public string? Urgency { get; set; }
    public string? RequestedAction { get; set; }
    public List<string>? Topics { get; set; }
    public string? Stage { get; set; }
    public double? RoundSizeUsd { get; set; }
    public string? Geo { get; set; }
    public string? Deadline { get; set; }
}
public sealed class SubmissionEvidence { public string? Type { get; set; } public string? Value { get; set; } public string? Name { get; set; } public string? Url { get; set; } }
public sealed class AnswerSubmission { public List<SubmissionAnswer>? Answers { get; set; } }
public sealed class SubmissionAnswer { public string? Type { get; set; } public string? Value { get; set; } }

public sealed record OpenQuestion(string Id, string Type, string Text);
public sealed record ViewMessage(string From, string Kind, string Text, DateTime At);
public sealed record SenderView(
    string IntentId, string Status, string RecipientName, string RecipientAddress, List<OpenQuestion> OpenQuestions,
    string? DeclineReason, List<ViewMessage> Messages, DateTime CreatedAt, DateTime UpdatedAt, string? SenderToken);

public sealed record ProtocolError(string Error, string Message);

/// <summary>The sender's side of the Business Intent Protocol.</summary>
public sealed class Protocol(AgentCore core, IAgentModel ai)
{
    private AgenticDb Db => core.Db;

    public async Task<(int status, object body)> Submit(IntentSubmission req, string? senderMemberId)
    {
        var cat = core.Catalog;
        var address = req.Recipient?.AgentAddress?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(address)) return (400, new ProtocolError("invalid_request", "recipient.agent_address is required."));
        var recipient = await Db.Members.FirstOrDefaultAsync(m => m.AgentAddress == address);
        if (recipient is null) return (404, new ProtocolError("unknown_recipient", "No agent answers at " + address + "."));
        var i = req.Intent;
        var objective = i?.Objective?.Trim();
        if (string.IsNullOrEmpty(objective)) return (400, new ProtocolError("invalid_request", "intent.objective is required."));
        if (objective.Length > 200) return (400, new ProtocolError("invalid_request", "intent.objective must be 200 characters or fewer."));
        if ((i!.ValueProposition?.Length ?? 0) > 600) return (400, new ProtocolError("invalid_request", "intent.value_proposition must be 600 characters or fewer."));
        if ((req.Message?.Length ?? 0) > 2000) return (400, new ProtocolError("invalid_request", "message must be 2000 characters or fewer."));
        if ((req.FitEvidence?.Count ?? 0) > 12) return (400, new ProtocolError("invalid_request", "At most 12 fit_evidence items are accepted."));

        Member? sender = null;
        if (senderMemberId is not null)
        {
            sender = await Db.Members.FindAsync(senderMemberId);
            if (sender?.Id == recipient.Id) return (400, new ProtocolError("invalid_request", "You can’t send an intent to your own agent."));
        }

        var category = i.Category is not null && cat.Categories.ContainsKey(i.Category) ? i.Category : "other";
        var evidence = (req.FitEvidence ?? [])
            .Select(e => new EvidenceItem(MapEvidenceType(e.Type), Trim(e.Value ?? e.Url ?? e.Name, 300)))
            .Where(e => e.Value.Length > 0)
            .ToList();
        var text = string.Join(' ', new[] { objective, i.ValueProposition, req.Message }.Where(s => !string.IsNullOrWhiteSpace(s)));
        var now = DateTime.UtcNow;
        var token = AgentCore.NewToken();
        var displayName = Trim(req.Sender?.DisplayName, 80);
        var it = new Intent
        {
            Id = AgentCore.NewIntentId(),
            RecipientId = recipient.Id,
            SenderId = sender?.Id,
            SenderName = sender?.Name ?? (displayName.Length > 0 ? displayName : "Anonymous sender"),
            SenderOrg = sender is null ? NullIfEmpty(Trim(req.Sender?.Organization, 80)) : null,
            Category = category,
            Tags = (i.Topics ?? []).Select(t => Trim(t, 40)).Where(t => t.Length > 0).Distinct().Take(6).ToList(),
            Stage = i.Stage is not null && cat.Stages.Contains(i.Stage) ? i.Stage : null,
            Amount = i.RoundSizeUsd is > 0 and < 1e11 ? i.RoundSizeUsd : null,
            Geo = i.Geo is not null && cat.Geos.Contains(i.Geo) ? i.Geo : null,
            Objective = objective,
            ValueProp = Trim(i.ValueProposition, 600),
            RequestedAction = i.RequestedAction is not null && Catalog.Actions.Contains(i.RequestedAction) ? i.RequestedAction : "reply",
            Urgency = i.Urgency is not null && Catalog.Urgencies.Contains(i.Urgency) ? i.Urgency : "normal",
            Deadline = NullIfEmpty(Trim(i.Deadline, 80)),
            ValueScore = Catalog.ValueByCategory.GetValueOrDefault(category, 0.3),
            Generic = PolicyEngine.CountStockPhrases(text),
            Text = text,
            ReceivedAt = now,
            UpdatedAt = now,
            SenderTokenHash = AgentCore.HashToken(token),
        };
        it.SetEvidence(evidence);
        Db.Intents.Add(it);

        var policy = await core.PolicyFor(recipient.Id);
        var ev = await core.Reevaluate(it, policy, "agent", forceLog: true);
        var au = policy.Autonomy;
        if (ev.Lane == Lanes.Medium && ev.Questions.Count > 0 && au.AutoQuestion)
        {
            core.SetAsked(it, ev.Questions);
            foreach (var q in ev.Questions) core.Say(it, "agent", "question", q.Q, q.Type);
        }
        else if ((ev.Lane == Lanes.Low && au.AutoDecline) || ev.Lane == Lanes.Declined)
        {
            it.Status = "declined";
            it.StatusDetail = "Declined automatically: " + ev.Why;
            core.Say(it, "agent", "decline", "Thanks for reaching out. " + SenderReason(ev, it.Category));
        }
        Briefs.Queue(it, ev, ai);
        await Db.SaveChangesAsync();
        return (201, await View(it, token));
    }

    public async Task<Intent?> FindForSender(string id, string? token, string? senderMemberId)
    {
        var it = await Db.Intents.FirstOrDefaultAsync(x => x.Id == id);
        if (it is null) return null;
        if (senderMemberId is not null && it.SenderId == senderMemberId) return it;
        if (!string.IsNullOrEmpty(token) && it.SenderTokenHash == AgentCore.HashToken(token)) return it;
        return null;
    }

    public async Task<(int status, object body)> Answer(Intent it, AnswerSubmission req)
    {
        var messages = await Db.Messages.Where(m => m.IntentId == it.Id).ToListAsync();
        var open = AgentCore.OpenQuestions(it, messages);
        if (open.Count == 0) return (409, new ProtocolError("no_open_questions", "There are no open questions on this intent."));
        var answers = (req.Answers ?? []).Where(a => a.Type is not null && open.Any(q => q.Type == a.Type) && !string.IsNullOrWhiteSpace(a.Value)).ToList();
        if (answers.Count == 0) return (400, new ProtocolError("invalid_request", "Answer at least one open question. Use the question’s type."));

        var evidence = it.GetEvidence();
        foreach (var a in answers)
        {
            var value = Trim(a.Value, 600);
            core.Say(it, "sender", "answer", value, a.Type);
            evidence.Add(new EvidenceItem(a.Type!, value));
            if (a.Type == "round" && it.Category == "fundraising" && ParseMoney(value) is double amount) it.Amount = amount;
        }
        it.SetEvidence(evidence);
        it.Answered = true;
        var policy = await core.PolicyFor(it.RecipientId);
        var ev = await core.Reevaluate(it, policy, "agent", forceLog: true);
        if ((ev.Lane == Lanes.Low && policy.Autonomy.AutoDecline) || ev.Lane == Lanes.Declined)
        {
            it.Status = "declined";
            it.StatusDetail = "Declined automatically: " + ev.Why;
            core.Say(it, "agent", "decline", "Thanks for the answers. This still isn’t a match. " + SenderReason(ev, it.Category));
        }
        Briefs.Queue(it, ev, ai);
        await Db.SaveChangesAsync();
        return (200, await View(it, null));
    }

    public async Task<SenderView> View(Intent it, string? includeToken)
    {
        var recipient = await Db.Members.FindAsync(it.RecipientId);
        var messages = (await Db.Messages.AsNoTracking().Where(m => m.IntentId == it.Id).ToListAsync())
            .Concat(Db.Messages.Local.Where(m => m.IntentId == it.Id && m.Id == 0))
            .OrderBy(m => m.At).ToList();
        var open = AgentCore.OpenQuestions(it, messages);
        var policy = await core.PolicyFor(it.RecipientId);
        var ev = await core.Evaluate(it, policy);
        var (status, reason) = SenderStatus(it, ev, open.Count, policy.Autonomy.AutoDecline, messages, SenderReason(ev, it.Category));
        return new SenderView(
            it.Id, status, recipient?.Name ?? "", recipient?.AgentAddress ?? "",
            open.Select((q, n) => new OpenQuestion("q_" + (n + 1), q.Type, q.Q)).ToList(),
            reason,
            messages.Select(m => new ViewMessage(m.Who == "owner" ? "recipient" : m.Who, m.Kind, m.Text, m.At)).ToList(),
            it.ReceivedAt, it.UpdatedAt, includeToken);
    }

    /// <summary>What the sender is allowed to see. The lane and score stay private to the recipient.</summary>
    public static (string status, string? reason) SenderStatus(Intent it, Evaluation ev, int openQuestions, bool autoDecline, List<IntentMessage> messages, string senderReason)
    {
        var declineText = messages.LastOrDefault(m => m.Kind == "decline")?.Text;
        switch (it.Status)
        {
            case "declined": return ("declined", declineText ?? senderReason);
            case "replied": case "intro": return ("accepted", null);
            case "scheduled": return ("scheduled", null);
            case "delegated": return ("in_review", null);
            case "held": return ("queued_for_digest", null);
            case "archived": return ("closed", null);
            case "reported": return ("rejected", "This intent was not delivered.");
        }
        return it.EffectiveLane switch
        {
            Lanes.Blocked => ("rejected", "This intent was not delivered."),
            Lanes.Declined => ("declined", senderReason),
            Lanes.Low => autoDecline ? ("declined", senderReason) : ("closed", null),
            Lanes.Medium => openQuestions > 0 ? ("qualifying", null) : ("queued_for_digest", null),
            _ => ("delivered", null),
        };
    }

    public async Task<object?> AgentCard(string address)
    {
        address = address.Trim().ToLowerInvariant();
        var m = await Db.Members.AsNoTracking().FirstOrDefaultAsync(x => x.AgentAddress == address);
        if (m is null) return null;
        var p = await core.PolicyFor(m.Id);
        var disclose = p.Privacy.Disclose;
        bool Shows(string key) => !disclose.TryGetValue(key, out var v) || v;
        var open = p.Categories.Where(c => c.Value == "open").Select(c => c.Key).ToList();
        return new
        {
            name = m.Name + "’s agent",
            description = "Recipient agent for " + m.Name + ", " + m.Headline + ".",
            address = m.AgentAddress,
            version = core.Catalog.ProtocolVersion,
            skills = new object[]
            {
                new { id = "submit_intent", name = "Receive a Business Intent", tags = open },
                new { id = "answer_question", name = "Qualification thread" },
            },
            authentication = new { schemes = new[] { "anonymous", "session" } },
            x_knockero = new
            {
                owner = "person:" + m.Id,
                verified_claims = m.Verified,
                policy = new
                {
                    template = p.Template,
                    categories = p.Categories,
                    required_evidence = p.Evidence,
                    thresholds = new { high = p.Thresholds.High, medium = p.Thresholds.Medium },
                    topics = Shows("thesis") ? p.OpenTo : null,
                    stages = Shows("check") ? p.Stages : null,
                    check = Shows("check") && p.Check.Max < 1e11 ? new { min = p.Check.Min, max = p.Check.Max } : null,
                    geo = p.Geo,
                    response_times = Shows("response") ? "HIGH: same day · MEDIUM: next digest · Declines always include a reason" : null,
                },
            },
        };
    }

    /// <summary>A decline reason the sender may see: no scores, thresholds, VIPs or blocklist entries.</summary>
    public string SenderReason(Evaluation ev, string category)
    {
        if (ev.Lane == Lanes.Blocked) return "This intent was not delivered.";
        if (ev.Lane == Lanes.Declined)
            return ev.CategoryStatus == "closed" && !ev.Vip
                ? core.Catalog.CategoryLabel(category) + " is closed in the recipient’s policy."
                : "It touches a topic the recipient does not accept.";
        if (ev.Why.StartsWith("Outside your thesis", StringComparison.Ordinal)) return "It is outside the recipient’s current focus.";
        var hint = ev.Missing.Count > 0
            ? " Adding " + string.Join(", ", ev.Missing.Select(m => PolicyEngine.Lc(core.Catalog.Evidence.TryGetValue(m, out var d) ? d.Label : m))) + " may help."
            : "";
        return "It doesn’t match the recipient’s current priorities closely enough." + hint;
    }

    private string MapEvidenceType(string? type)
    {
        if (type is not null && core.Catalog.Evidence.ContainsKey(type)) return type;
        return type switch { "metric" => "traction", "proof_link" => "deck", "profile_overlap" => "context", _ => "context" };
    }

    private static string Trim(string? s, int max)
    {
        s = (s ?? "").Trim();
        return s.Length > max ? s[..max] : s;
    }

    private static string? NullIfEmpty(string s) => s.Length == 0 ? null : s;

    /// <summary>Reads the first money amount in an answer such as "$1.5M allocation" or "900K".</summary>
    public static double? ParseMoney(string s)
    {
        var m = System.Text.RegularExpressions.Regex.Match(s, @"\$?\s?(\d+(?:\.\d+)?)\s?(k|m)?\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (!m.Success) return null;
        var n = double.Parse(m.Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture);
        var unit = m.Groups[2].Value.ToLowerInvariant();
        return unit == "m" ? n * 1e6 : unit == "k" ? n * 1e3 : n < 100 ? n * 1e6 : n * 1e3;
    }
}
public sealed class ParseRequest { public string? Text { get; set; } }
