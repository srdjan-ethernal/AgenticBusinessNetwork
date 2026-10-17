using System.Security.Claims;
using Agentic.Api.Data;
using Agentic.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace Agentic.Api.Endpoints;

public sealed record AdminBody(string? Email);

/// <summary>Company pages: create, list the ones you manage, manage admins, and act as the company.</summary>
public static class CompaniesApi
{
    public const string ActAsHeader = "X-Act-As";
    public const string ActorClaim = "abn:actor";

    /// <summary>Routes where an admin may act as a company: its inbox, policy, profile and searches.
    /// Everything personal (account, contacts, sign-in) always uses the signed-in person.</summary>
    private static readonly string[] ActingPaths = ["/api/bootstrap", "/api/policy", "/api/intents", "/api/profile", "/api/directory", "/api/feed", "/api/posts", "/api/comments", "/api/members", "/api/notifications", "/api/social", "/api/connections"];

    /// <summary>With header X-Act-As: {companyId}, a company admin's request runs as the company.</summary>
    public static async Task ActAs(HttpContext ctx, Func<Task> next)
    {
        var asId = ctx.Request.Headers[ActAsHeader].ToString();
        if (asId.Length > 0 && ctx.User.Identity?.IsAuthenticated == true && ActingPaths.Any(p => ctx.Request.Path.StartsWithSegments(p)))
        {
            var me = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
            if (asId != me)
            {
                var db = ctx.RequestServices.GetRequiredService<AgenticDb>();
                if (!await db.OrgAdmins.AnyAsync(a => a.OrgId == asId && a.MemberId == me))
                {
                    ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                    await ctx.Response.WriteAsJsonAsync(new { error = "You don’t manage this company page." });
                    return;
                }
                ctx.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, asId), new Claim(ActorClaim, me)], "acting"));
            }
        }
        await next();
    }

    public static void MapCompaniesApi(this WebApplication app)
    {
        var g = app.MapGroup("/api/companies").RequireAuthorization();

        g.MapPost("", async (CompanyCreate req, ClaimsPrincipal user, Companies companies) =>
        {
            var (company, error) = await companies.Create(Id(user), req);
            if (company is null) return Results.BadRequest(new { error });
            return Results.Json(new { id = company.Id, agentAddress = company.AgentAddress, warning = error }, statusCode: StatusCodes.Status201Created);
        });

        g.MapGet("/mine", async (ClaimsPrincipal user, Companies companies) => Results.Ok(await companies.Mine(Id(user))));

        g.MapGet("/{id}/admins", async (string id, ClaimsPrincipal user, Companies companies) =>
            await companies.Admins(Id(user), id) is { } list ? Results.Ok(list) : Results.Json(new { error = "You don’t manage this company page." }, statusCode: StatusCodes.Status403Forbidden));

        g.MapPost("/{id}/admins", async (string id, AdminBody body, ClaimsPrincipal user, Companies companies) =>
            await companies.AddAdmin(Id(user), id, body.Email) is { } error ? Results.BadRequest(new { error }) : Results.Ok(await companies.Admins(Id(user), id)));

        g.MapDelete("/{id}/admins/{memberId}", async (string id, string memberId, ClaimsPrincipal user, Companies companies) =>
            await companies.RemoveAdmin(Id(user), id, memberId) is { } error ? Results.BadRequest(new { error }) : Results.Ok(await companies.Admins(Id(user), id) ?? new List<object>()));

        g.MapPost("/{id}/follow", async (string id, ClaimsPrincipal user, Companies companies) =>
            await companies.Follow(Id(user), id, true) is int n ? Results.Ok(new { following = true, followers = n }) : Results.NotFound());
        g.MapDelete("/{id}/follow", async (string id, ClaimsPrincipal user, Companies companies) =>
            await companies.Follow(Id(user), id, false) is int n ? Results.Ok(new { following = false, followers = n }) : Results.NotFound());
        g.MapGet("/{id}/followers", async (string id, ClaimsPrincipal user, Companies companies) =>
            await companies.Followers(Id(user), id) is { } list ? Results.Ok(list) : Results.Json(new { error = "You don’t manage this company page." }, statusCode: StatusCodes.Status403Forbidden));
        g.MapDelete("/{id}/employees/{memberId}", async (string id, string memberId, ClaimsPrincipal user, Companies companies) =>
            await companies.RemoveEmployee(Id(user), id, memberId) is { } error ? Results.BadRequest(new { error }) : Results.Ok(new { ok = true }));

        // ---------- public: company pages open without an account, like on LinkedIn ----------
        app.MapGet("/api/companies/{id}/page", async (string id, ClaimsPrincipal user, Companies companies) =>
            await companies.Page(id, user.Identity?.IsAuthenticated == true ? Id(user) : null) is { } page ? Results.Ok(page) : Results.NotFound(new { error = "This company page doesn’t exist." }));
        app.MapGet("/api/companies/{id}/posts", async (string id, long? before, ClaimsPrincipal user, AgenticDb db, Social social) =>
        {
            if (!await db.Members.AnyAsync(m => m.Id == id && m.Kind == "company")) return Results.NotFound();
            return Results.Ok(await social.ByAuthor(user.Identity?.IsAuthenticated == true ? Id(user) : "", id, before));
        });

        // knockero.com/company/{id}: a link to share. Link previews (LinkedIn, WhatsApp, Slack) read the title and
        // description here; browsers go straight on to the page in the app.
        app.MapGet("/company/{id}", async (string id, AgenticDb db, HttpContext ctx) =>
        {
            var c = await db.Members.AsNoTracking().FirstOrDefaultAsync(m => m.Id == id && m.Kind == "company");
            var target = "/#company." + Uri.EscapeDataString(id);
            if (c is null) return Results.Redirect(target);
            var url = $"{ctx.Request.Scheme}://{ctx.Request.Host}/company/{Uri.EscapeDataString(id)}";
            var title = Html(c.Name + " · Knockero");
            var desc = Html(c.Headline);
            var html = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>" + title + "</title>" +
                "<meta name=\"description\" content=\"" + desc + "\"><meta property=\"og:type\" content=\"website\"><meta property=\"og:site_name\" content=\"Knockero\">" +
                "<meta property=\"og:title\" content=\"" + title + "\"><meta property=\"og:description\" content=\"" + desc + "\"><meta property=\"og:url\" content=\"" + Html(url) + "\">" +
                "<link rel=\"canonical\" href=\"" + Html(url) + "\"><meta http-equiv=\"refresh\" content=\"0;url=" + Html(target) + "\">" +
                "</head><body><p><a href=\"" + Html(target) + "\">" + Html(c.Name) + " on Knockero</a></p></body></html>";
            return Results.Content(html, "text/html; charset=utf-8");
        });
    }

    private static string Html(string? s) => (s ?? "").Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");

    private static string Id(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier)!;
}
