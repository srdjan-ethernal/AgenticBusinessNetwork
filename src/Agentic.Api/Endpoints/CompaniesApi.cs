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
    private static readonly string[] ActingPaths = ["/api/bootstrap", "/api/policy", "/api/intents", "/api/profile", "/api/directory"];

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
    }

    private static string Id(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier)!;
}
