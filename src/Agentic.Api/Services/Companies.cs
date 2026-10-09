using System.Text.Json.Nodes;
using Agentic.Api.Data;
using Agentic.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Agentic.Api.Services;

public sealed record CompanyCreate(string? Name, string? Tagline, string? Website, string? Location, List<string>? Industries, bool WorksHere);

/// <summary>Company pages. A company is an <see cref="Organization"/> plus its own agent: a member of kind
/// "company" with the same id, so it has an agent address, a policy, an inbox and a profile like anyone else.
/// Admins manage it by acting as the company (header X-Act-As).</summary>
public sealed class Companies(AgentCore core, Accounts accounts)
{
    private AgenticDb Db => core.Db;

    public Task<bool> IsAdmin(string memberId, string companyId) => Db.OrgAdmins.AnyAsync(a => a.OrgId == companyId && a.MemberId == memberId);

    public async Task<(Member? company, string? error)> Create(string ownerId, CompanyCreate req)
    {
        var name = (req.Name ?? "").Trim();
        var tagline = (req.Tagline ?? "").Trim();
        if (name.Length is < 2 or > 80) return (null, "Enter the company name (2 to 80 characters).");
        if (tagline.Length is < 2 or > 160) return (null, "Add a one-line description, for example “Hotel and home textiles, made to order”.");
        if (await Db.OrgAdmins.CountAsync(a => a.MemberId == ownerId) >= 10) return (null, "You can manage up to 10 company pages.");
        var owner = await Db.Members.FindAsync(ownerId);
        if (owner is null || owner.Kind != "person") return (null, "Only people can create company pages.");

        var id = await Unique(Accounts.Slug(name));
        var address = id.Replace('-', '.') + "@" + core.Catalog.AddressNamespace;
        for (var n = 2; await Db.Members.AnyAsync(m => m.AgentAddress == address); n++) address = id.Replace('-', '.') + "." + n + "@" + core.Catalog.AddressNamespace;
        var industries = (req.Industries ?? []).Where(core.Catalog.Topics.Contains).Distinct().Take(12).ToList();
        var company = new Member
        {
            Id = id, Kind = "company", Name = name, Headline = tagline, AgentAddress = address, Template = "founder", Reputation = 50,
            ProfileJson = new JsonObject
            {
                ["name"] = name, ["headline"] = tagline, ["topics"] = new JsonArray(industries.Select(t => (JsonNode)t).ToArray()),
                ["c"] = new JsonArray("#0f766e", "#5eead4"),
            }.ToJsonString(),
            DigestEnabled = false, CreatedAt = DateTime.UtcNow,
        };
        Db.Members.Add(company);
        Db.Organizations.Add(new Organization { Id = id, Name = name, ProfileJson = new JsonObject { ["name"] = name, ["tagline"] = tagline }.ToJsonString() });
        Db.OrgAdmins.Add(new OrgAdmin { OrgId = id, MemberId = ownerId, AddedAt = DateTime.UtcNow });
        var policy = core.Catalog.PolicyFromTemplate("founder", industries);
        var rec = new PolicyRecord { OwnerId = id };
        rec.Write(policy);
        Db.Policies.Add(rec);
        if (req.WorksHere) owner.OrgId = id;
        await Db.SaveChangesAsync();

        // Website and location go through the same validation as any profile.
        if (!string.IsNullOrWhiteSpace(req.Website) || !string.IsNullOrWhiteSpace(req.Location))
        {
            var (ok, error) = await accounts.UpdateProfile(id, new ProfileUpdate(null, null, req.Location, null, null, Website: req.Website));
            if (!ok) return (company, error);
        }
        return (company, null);
    }

    /// <summary>The company pages you manage, with what is waiting in each inbox.</summary>
    public async Task<List<object>> Mine(string memberId)
    {
        var ids = await Db.OrgAdmins.Where(a => a.MemberId == memberId).Select(a => a.OrgId).ToListAsync();
        var companies = await Db.Members.AsNoTracking().Where(m => ids.Contains(m.Id)).ToListAsync();
        var waiting = await Db.Intents.AsNoTracking().Where(i => ids.Contains(i.RecipientId) && i.Status == null)
            .GroupBy(i => i.RecipientId).Select(g => new { g.Key, Count = g.Count(i => i.Lane == Lanes.High || i.Lane == Lanes.Medium) }).ToListAsync();
        return companies.OrderBy(c => c.Name).Select(c => (object)new
        {
            id = c.Id, name = c.Name, headline = c.Headline,
            photo = JsonNode.Parse(c.ProfileJson)?["photo"]?.DeepClone(),
            waiting = waiting.FirstOrDefault(w => w.Key == c.Id)?.Count ?? 0,
        }).ToList();
    }

    public async Task<object?> Admins(string viewerId, string companyId)
    {
        if (!await IsAdmin(viewerId, companyId)) return null;
        var ids = await Db.OrgAdmins.Where(a => a.OrgId == companyId).OrderBy(a => a.AddedAt).Select(a => a.MemberId).ToListAsync();
        var people = await Db.Members.AsNoTracking().Where(m => ids.Contains(m.Id)).ToDictionaryAsync(m => m.Id);
        return ids.Where(people.ContainsKey).Select(id => new { id, name = people[id].Name, email = people[id].Email, you = id == viewerId }).ToList();
    }

    public async Task<string?> AddAdmin(string actorId, string companyId, string? email)
    {
        if (!await IsAdmin(actorId, companyId)) return "You don’t manage this company page.";
        var norm = Accounts.NormalizeEmail(email);
        var m = await Db.Members.FirstOrDefaultAsync(x => x.Email == norm);
        if (m is null) return "Nobody on Knockero uses that email yet. Invite them first, then add them.";
        if (await IsAdmin(m.Id, companyId)) return m.Name + " already manages this page.";
        Db.OrgAdmins.Add(new OrgAdmin { OrgId = companyId, MemberId = m.Id, AddedAt = DateTime.UtcNow });
        await Db.SaveChangesAsync();
        return null;
    }

    public async Task<string?> RemoveAdmin(string actorId, string companyId, string memberId)
    {
        if (!await IsAdmin(actorId, companyId)) return "You don’t manage this company page.";
        var all = await Db.OrgAdmins.Where(a => a.OrgId == companyId).ToListAsync();
        var target = all.FirstOrDefault(a => a.MemberId == memberId);
        if (target is null) return "That person doesn’t manage this page.";
        if (all.Count == 1) return "A company page needs at least one admin. Add someone else first.";
        Db.OrgAdmins.Remove(target);
        await Db.SaveChangesAsync();
        return null;
    }

    private async Task<string> Unique(string baseId)
    {
        var id = baseId;
        for (var n = 2; await Db.Members.AnyAsync(m => m.Id == id) || await Db.Organizations.AnyAsync(o => o.Id == id); n++) id = baseId + "-" + n;
        return id;
    }
}
