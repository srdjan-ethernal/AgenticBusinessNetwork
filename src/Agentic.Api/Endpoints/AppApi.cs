using System.Security.Claims;
using System.Text.Json.Nodes;
using Agentic.Api.Data;
using Agentic.Api.Domain;
using Agentic.Api.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;

namespace Agentic.Api.Endpoints;

public sealed record SessionRequest(string? MemberId);
public sealed record ActionRequest(string? Action, string? Text, string? Detail);
public sealed record LaneRequest(string? Lane);

/// <summary>The web client's API (cookie session). Every mutating call returns a fresh bootstrap.</summary>
public static class AppApi
{
    public static void MapAppApi(this WebApplication app)
    {
        var devLogin = app.Configuration.GetValue("Auth:DevLogin", false);
        var api = app.MapGroup("/api");

        api.MapGet("/health", () => Results.Ok(new { ok = true, mode = "live", devLogin, version = "0.1" }));

        // Development sign-in: pick a seeded member. Real sign-in replaces this in the next increment.
        api.MapGet("/members", async (AgenticDb db) =>
        {
            if (!devLogin) return Results.NotFound();
            var list = await db.Members.AsNoTracking().Where(m => m.Kind == "person").OrderBy(m => m.Name).ToListAsync();
            return Results.Ok(list.Select(m => new { id = m.Id, name = m.Name, headline = m.Headline, c = JsonNode.Parse(m.ProfileJson)?["c"] }));
        });

        api.MapPost("/session", async (SessionRequest req, AgenticDb db, HttpContext ctx) =>
        {
            if (!devLogin) return Results.NotFound();
            var m = await db.Members.FindAsync(req.MemberId ?? "");
            if (m is null || m.Kind != "person") return Results.BadRequest(new { error = "Unknown member." });
            var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, m.Id), new Claim(ClaimTypes.Name, m.Name)], CookieAuthenticationDefaults.AuthenticationScheme);
            await ctx.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));
            return Results.Ok(new { id = m.Id });
        });

        api.MapGet("/session", (ClaimsPrincipal user) =>
            Results.Ok(new { member = user.Identity?.IsAuthenticated == true ? user.FindFirstValue(ClaimTypes.NameIdentifier) : null }));

        api.MapDelete("/session", async (HttpContext ctx) =>
        {
            await ctx.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        });

        var me = api.MapGroup("").RequireAuthorization();

        me.MapGet("/bootstrap", async (ClaimsPrincipal user, Inbox inbox) => Results.Json(await inbox.Bootstrap(Id(user)), Json.Web));

        me.MapPut("/policy", async (PolicyDocument doc, ClaimsPrincipal user, Inbox inbox) =>
        {
            var (saved, error) = await inbox.SavePolicy(Id(user), doc);
            return error is not null ? Results.BadRequest(new { error }) : Results.Ok(new { version = saved!.Version });
        });

        me.MapPost("/intents/{id}/ask", async (string id, ClaimsPrincipal user, Inbox inbox) =>
        {
            var it = await inbox.Find(Id(user), id);
            if (it is null) return Results.NotFound();
            var (ok, error) = await inbox.Ask(Id(user), it);
            return ok ? Results.Json(await inbox.Bootstrap(Id(user)), Json.Web) : Results.BadRequest(new { error });
        });

        me.MapPost("/intents/{id}/action", async (string id, ActionRequest req, ClaimsPrincipal user, Inbox inbox) =>
        {
            var it = await inbox.Find(Id(user), id);
            if (it is null) return Results.NotFound();
            var (ok, error) = await inbox.Act(Id(user), it, req.Action ?? "", req.Text, req.Detail);
            return ok ? Results.Json(await inbox.Bootstrap(Id(user)), Json.Web) : Results.BadRequest(new { error });
        });

        me.MapPost("/intents/{id}/lane", async (string id, LaneRequest req, ClaimsPrincipal user, Inbox inbox) =>
        {
            var it = await inbox.Find(Id(user), id);
            if (it is null) return Results.NotFound();
            var (ok, error) = await inbox.SetLane(Id(user), it, req.Lane ?? "");
            return ok ? Results.Json(await inbox.Bootstrap(Id(user)), Json.Web) : Results.BadRequest(new { error });
        });
    }

    private static string Id(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier)!;
}
