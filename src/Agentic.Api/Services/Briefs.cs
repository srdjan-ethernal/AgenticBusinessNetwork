using System.Text.Json;
using Agentic.Api.Data;
using Agentic.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Agentic.Api.Services;

/// <summary>Model-written briefs. Intents are queued when they arrive (or get answers) and a background
/// worker writes the brief, so the sender's submit stays fast and a slow or failed call never blocks routing.</summary>
public static class Briefs
{
    /// <summary>Queue a brief when the intent will reach the owner's inbox. Declined and blocked intents keep the
    /// deterministic brief: no model call for spam or injection attempts.</summary>
    public static void Queue(Intent it, Evaluation ev, IAgentModel ai)
    {
        if (!ai.Enabled || it.DemoJson is not null) return;
        if (ev.Lane is Lanes.Blocked or Lanes.Declined || it.Status == "declined") return;
        it.BriefStatus = "pending";
    }

    public static BriefOutput? Read(Intent it) =>
        it.BriefStatus == "ready" && it.BriefJson is not null ? JsonSerializer.Deserialize<BriefOutput>(it.BriefJson, Json.Web) : null;
}

public sealed class BriefWorker(IServiceScopeFactory scopes, IAgentModel ai, IConfiguration config, ILogger<BriefWorker> log) : BackgroundService
{
    private readonly int _pollMs = config.GetValue("Ai:PollMs", 3000);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!ai.Enabled) return;
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await RunOnce(stoppingToken); }
            catch (Exception e) when (e is not OperationCanceledException) { log.LogError(e, "Brief worker failed"); }
            try { await Task.Delay(_pollMs, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }

    public async Task<int> RunOnce(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var core = scope.ServiceProvider.GetRequiredService<AgentCore>();
        var db = core.Db;
        var batch = await db.Intents.Where(i => i.BriefStatus == "pending").OrderBy(i => i.UpdatedAt).Take(5).ToListAsync(ct);
        foreach (var it in batch)
        {
            var input = await Input(core, it);
            var brief = input is null ? null : await ai.Brief(input, it.RecipientId, ct);
            if (brief is null) it.BriefStatus = "failed";
            else
            {
                it.BriefJson = JsonSerializer.Serialize(brief, Json.Web);
                it.BriefStatus = "ready";
                it.BriefModel = ai.Name;
                it.BriefAt = DateTime.UtcNow;
            }
            await db.SaveChangesAsync(ct);
        }
        return batch.Count;
    }

    private static async Task<BriefInput?> Input(AgentCore core, Intent it)
    {
        var owner = await core.Db.Members.FindAsync(it.RecipientId);
        if (owner is null) return null;
        var policy = await core.PolicyFor(owner.Id);
        var ev = await core.Evaluate(it, policy);
        var sender = await core.SenderFor(it);
        var thread = await core.Db.Messages.AsNoTracking().Where(m => m.IntentId == it.Id).OrderBy(m => m.At)
            .Select(m => new { m.Who, m.Text }).ToListAsync();
        return new BriefInput(
            owner.Name, owner.Headline, policy.Template, policy.OpenTo,
            ev.Lane, ev.Score, ev.Why, ev.Reasons.Select(r => r.Text).ToList(),
            ev.Missing.Select(m => core.Catalog.Evidence.TryGetValue(m, out var d) ? d.Label : m).ToList(),
            it.SenderName, it.SenderOrg, sender.Verified.Count > 0, sender.Mutuals,
            it.Category, it.Objective, it.ValueProp, it.RequestedAction, it.Stage, it.Amount, it.Geo,
            it.GetEvidence(), thread.Select(t => (t.Who, t.Text)).ToList(), it.Text);
    }
}
