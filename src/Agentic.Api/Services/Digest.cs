using System.Net;
using System.Text;
using Agentic.Api.Data;
using Agentic.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Agentic.Api.Services;

/// <summary>The agent's daily email: what arrived since the last one, what needs the owner, what was handled.</summary>
public sealed class Digests(AgentCore core, EmailOptions email, IConfiguration config)
{
    private AgenticDb Db => core.Db;
    private readonly string? _publicUrl = config["App:PublicUrl"];

    /// <summary>Common abbreviations in policies ("CET") mapped to IANA zones; .NET converts IANA ids on every OS.</summary>
    private static readonly Dictionary<string, string> Zones = new(StringComparer.OrdinalIgnoreCase)
    {
        ["CET"] = "Europe/Berlin", ["CEST"] = "Europe/Berlin", ["EET"] = "Europe/Athens", ["WET"] = "Europe/Lisbon", ["GMT"] = "Europe/London",
        ["BST"] = "Europe/London", ["UTC"] = "Etc/UTC", ["ET"] = "America/New_York", ["EST"] = "America/New_York", ["EDT"] = "America/New_York",
        ["CT"] = "America/Chicago", ["CST"] = "America/Chicago", ["MT"] = "America/Denver", ["PT"] = "America/Los_Angeles",
        ["PST"] = "America/Los_Angeles", ["PDT"] = "America/Los_Angeles", ["IST"] = "Asia/Kolkata", ["SGT"] = "Asia/Singapore",
        ["JST"] = "Asia/Tokyo", ["AEST"] = "Australia/Sydney",
    };

    public static TimeZoneInfo Zone(string? tz)
    {
        var id = tz is not null && Zones.TryGetValue(tz.Trim(), out var mapped) ? mapped : tz?.Trim();
        if (!string.IsNullOrEmpty(id))
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
            catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException) { /* fall through */ }
        return TimeZoneInfo.Utc;
    }

    /// <summary>Is a digest due now? Once per local day, from the start of the owner's working hours.</summary>
    public static bool Due(Member m, PolicyDocument policy, DateTime utcNow)
    {
        var zone = Zone(policy.Hours.Tz);
        var local = TimeZoneInfo.ConvertTimeFromUtc(utcNow, zone);
        var start = TimeSpan.TryParse(policy.Hours.Start, out var s) ? s : TimeSpan.FromHours(9);
        if (local.TimeOfDay < start) return false;
        if (m.LastDigestAt is not { } last) return true;
        return TimeZoneInfo.ConvertTimeFromUtc(last, zone).Date < local.Date;
    }

    /// <summary>Queues the digest; false when nothing arrived since the last one (no empty emails).</summary>
    public async Task<bool> Queue(Member m, DateTime utcNow, bool force = false)
    {
        // The first digest covers everything since the account was created (at most a week).
        var since = m.LastDigestAt ?? (m.CreatedAt > utcNow.AddDays(-7) ? m.CreatedAt : utcNow.AddDays(-7));
        var intents = await Db.Intents.AsNoTracking().Where(i => i.RecipientId == m.Id && i.ReceivedAt > since && i.ReceivedAt <= utcNow).ToListAsync();
        // "Hold for the digest" in the inbox: held intents come back here, whenever they arrived.
        var held = await Db.Intents.AsNoTracking().Where(i => i.RecipientId == m.Id && i.Status == "held").ToListAsync();
        m.LastDigestAt = utcNow;
        if (intents.Count == 0 && held.Count == 0 && !force) { await Db.SaveChangesAsync(); return false; }

        var baseUrl = (_publicUrl is { Length: > 0 } u ? u : "http://localhost:5320").TrimEnd('/');
        m.DigestToken ??= AgentCore.NewToken();
        var lanes = intents.GroupBy(i => i.EffectiveLane).ToDictionary(g => g.Key, g => g.Count());
        int N(string lane) => lanes.GetValueOrDefault(lane);
        var needYou = intents.Where(i => (i.EffectiveLane == Lanes.High || i.EffectiveLane == Lanes.Medium) && i.Status == null)
            .OrderByDescending(i => i.EffectiveLane == Lanes.High).ThenByDescending(i => i.Score).Take(6).ToList();
        needYou = needYou.Concat(held.Where(h => needYou.All(n => n.Id != h.Id))).Take(8).ToList();

        var summary = intents.Count == 0
            ? (held.Count > 0 ? "Nothing new arrived, but you asked your agent to bring these back today." : "Nothing new arrived since your last digest.")
            : $"Your agent screened {intents.Count} new {(intents.Count == 1 ? "intent" : "intents")}: {N(Lanes.High)} HIGH, {N(Lanes.Medium)} MEDIUM, {N(Lanes.Low)} LOW"
              + (N(Lanes.Declined) + N(Lanes.Blocked) > 0 ? $", and it declined or blocked {N(Lanes.Declined) + N(Lanes.Blocked)} for you." : ".");

        var text = new StringBuilder();
        string H(string s) => WebUtility.HtmlEncode(s);
        var html = new StringBuilder();
        if (needYou.Count > 0)
        {
            text.Append("Needs you:\n");
            html.Append("<p style=\"margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#65746e\">Needs you</p>");
            foreach (var it in needYou)
            {
                var line = Briefs.Read(it)?.Bullets.FirstOrDefault() ?? it.Objective;
                var url = baseUrl + "/#inbox." + it.Id;
                var lane = it.Status == "held" ? "HELD" : it.EffectiveLane.ToUpperInvariant();
                text.Append("- [").Append(lane).Append(' ').Append(it.Score).Append("] ").Append(it.SenderName).Append(": ").Append(line).Append("\n  ").Append(url).Append('\n');
                html.Append("<div style=\"border:1px solid #dfe5e2;border-radius:10px;padding:12px 14px;margin:0 0 8px\">")
                    .Append("<div style=\"font-size:12px;font-weight:600;color:").Append(it.EffectiveLane == Lanes.High ? "#0d7a69" : "#a15c07").Append("\">").Append(lane).Append(" · ").Append(it.Score).Append("</div>")
                    .Append("<div style=\"font-size:15px;font-weight:600;margin:2px 0\">").Append(H(it.SenderName)).Append(it.SenderOrg is null ? "" : " <span style=\"font-weight:400;color:#65746e\">(" + H(it.SenderOrg) + ")</span>").Append("</div>")
                    .Append("<div style=\"font-size:14px;line-height:1.45;color:#3b4a44\">").Append(H(line)).Append("</div>")
                    .Append("<a href=\"").Append(H(url)).Append("\" style=\"font-size:13px;color:#0d7a69\">Open in the inbox</a></div>");
            }
        }
        var brand = core.Catalog.BrandName;
        var mail = Mail.Compose("digest", m, email,
            needYou.Count > 0 ? $"{needYou.Count} {(needYou.Count == 1 ? "intent needs" : "intents need")} you today" : "Your agent’s daily digest",
            (force ? "Hi " : "Good morning ") + m.Name.Split(' ')[0] + ",", [summary], ("Open the Agent Inbox", baseUrl + "/#inbox"),
            "You get this once a day, at the start of your working hours, when something new arrived.",
            htmlBody: html.Length > 0 ? html.ToString() : null, textBody: text.Length > 0 ? text.ToString().TrimEnd() : null,
            unsubscribeUrl: baseUrl + "/#digest-off." + m.DigestToken);
        Db.Outbox.Add(mail);
        await Db.SaveChangesAsync();
        return true;
    }
}

/// <summary>Checks every few minutes who is due a digest.</summary>
public sealed class DigestWorker(IServiceScopeFactory scopes, IConfiguration config, ILogger<DigestWorker> log) : BackgroundService
{
    private readonly TimeSpan _every = TimeSpan.FromSeconds(config.GetValue("Digest:PollSeconds", 300));

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!config.GetValue("Digest:Enabled", true)) return;
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await RunOnce(DateTime.UtcNow); }
            catch (Exception e) when (e is not OperationCanceledException) { log.LogError(e, "Digest run failed"); }
            try { await Task.Delay(_every, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }

    public async Task<int> RunOnce(DateTime utcNow)
    {
        using var scope = scopes.CreateScope();
        var core = scope.ServiceProvider.GetRequiredService<AgentCore>();
        var digests = scope.ServiceProvider.GetRequiredService<Digests>();
        var members = await core.Db.Members.Where(m => m.Email != null && m.EmailVerified && m.DigestEnabled).ToListAsync();
        var sent = 0;
        foreach (var m in members)
        {
            var policy = await core.PolicyFor(m.Id);
            if (Digests.Due(m, policy, utcNow) && await digests.Queue(m, utcNow)) sent++;
        }
        return sent;
    }
}
