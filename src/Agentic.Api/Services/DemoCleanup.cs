using Agentic.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Agentic.Api.Services;

/// <summary>Removes the fictional demo network seeded on first start, keeping every real account.
/// Demo members are the ones without an email address (real accounts always have one).
/// Run on the server: <c>docker compose exec app dotnet Agentic.Api.dll --remove-demo</c>.</summary>
public static class DemoCleanup
{
    public sealed record Result(int Members, int Intents, int Organizations, int Relationships);

    public static async Task<Result> Run(AgenticDb db)
    {
        var demo = await db.Members.Where(m => m.Email == null && m.Kind != "company").Select(m => m.Id).ToListAsync();
        var companies = await db.Members.Where(m => m.Kind == "company").Select(m => m.Id).ToListAsync();
        var intents = await db.Intents.Where(i => demo.Contains(i.RecipientId) || (i.SenderId != null && demo.Contains(i.SenderId)))
            .Select(i => i.Id).ToListAsync();

        await using var tx = await db.Database.BeginTransactionAsync();
        await db.Messages.Where(m => intents.Contains(m.IntentId)).ExecuteDeleteAsync();
        await db.Decisions.Where(d => intents.Contains(d.IntentId)).ExecuteDeleteAsync();
        await db.AbuseReports.Where(a => intents.Contains(a.IntentId) || demo.Contains(a.ReporterId)).ExecuteDeleteAsync();
        var intentCount = await db.Intents.Where(i => intents.Contains(i.Id)).ExecuteDeleteAsync();
        var relCount = await db.Relationships.Where(r => demo.Contains(r.MemberId) || demo.Contains(r.OtherId)).ExecuteDeleteAsync();
        await db.Policies.Where(p => demo.Contains(p.OwnerId)).ExecuteDeleteAsync();
        await db.Photos.Where(p => demo.Contains(p.MemberId)).ExecuteDeleteAsync();
        await db.Contacts.Where(c => demo.Contains(c.OwnerId)).ExecuteDeleteAsync();
        await db.Contacts.Where(c => c.JoinedMemberId != null && demo.Contains(c.JoinedMemberId))
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.JoinedMemberId, (string?)null).SetProperty(c => c.Status, "new"));
        await db.EmailTokens.Where(t => demo.Contains(t.MemberId)).ExecuteDeleteAsync();
        await db.Outbox.Where(o => o.OwnerId != null && demo.Contains(o.OwnerId)).ExecuteDeleteAsync();
        // Real company pages have their own agent (a member of kind "company"); every other organization is demo.
        await db.Members.Where(m => m.OrgId != null && !companies.Contains(m.OrgId)).ExecuteUpdateAsync(s => s.SetProperty(m => m.OrgId, (string?)null));
        var orgCount = await db.Organizations.Where(o => !companies.Contains(o.Id)).ExecuteDeleteAsync();
        var memberCount = await db.Members.Where(m => demo.Contains(m.Id)).ExecuteDeleteAsync();
        await tx.CommitAsync();
        return new Result(memberCount, intentCount, orgCount, relCount);
    }
}
