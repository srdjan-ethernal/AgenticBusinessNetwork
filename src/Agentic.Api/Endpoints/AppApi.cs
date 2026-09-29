using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Agentic.Api.Data;
using Agentic.Api.Domain;
using Agentic.Api.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;

namespace Agentic.Api.Endpoints;

public sealed record SessionRequest(string? MemberId, string? AccessCode);
public sealed record SignupBody(string? Name, string? Email, string? Password, string? Headline, string? Location, string? Template, List<string>? Topics, string? AccessCode, string? InviteCode = null);
public sealed record ActionRequest(string? Action, string? Text, string? Detail);
public sealed record LaneRequest(string? Lane);

/// <summary>The web client's API (cookie session). Every mutating call returns a fresh bootstrap.</summary>
public static class AppApi
{
    public static void MapAppApi(this WebApplication app)
    {
        var devLogin = app.Configuration.GetValue("Auth:DevLogin", false);
        // Optional shared code that gates development sign-in on a public server.
        var accessCode = app.Configuration["Auth:AccessCode"] ?? "";
        // Open sign-up; while an access code is set it also gates sign-up (invite-only beta).
        var signup = app.Configuration.GetValue("Auth:Signup", true);
        var api = app.MapGroup("/api");

        api.MapGet("/health", () => Results.Ok(new { ok = true, mode = "live", devLogin, signup, accessCodeRequired = accessCode.Length > 0, version = "0.2" }));

        // ---------- real accounts ----------

        var auth = api.MapGroup("/auth").RequireRateLimiting("auth");

        auth.MapPost("/signup", async (SignupBody req, Accounts accounts, Contacts contacts, HttpContext ctx) =>
        {
            if (!signup) return Results.NotFound();
            // A personal invitation from a member counts as an invite code.
            var invite = req.InviteCode is { Length: > 0 } ? await contacts.FindInvite(req.InviteCode) : null;
            if (req.InviteCode is { Length: > 0 } && invite is null)
                return Results.Json(new { error = "This invitation link has already been used or is no longer valid." }, statusCode: StatusCodes.Status410Gone);
            if (invite is null && accessCode.Length > 0 && !CodeMatches(req.AccessCode, accessCode))
                return Results.Json(new { error = "Sign-up is invite-only on this server. Enter the access code you received." }, statusCode: StatusCodes.Status401Unauthorized);
            var (m, status, error) = await accounts.SignUp(new SignupRequest(req.Name, req.Email, req.Password, req.Headline, req.Location, req.Template, req.Topics));
            if (m is null) return Results.Json(new { error }, statusCode: status);
            if (invite is { } inv) await contacts.Accept(inv.contact, m);
            await SignIn(ctx, m);
            return Results.Json(new { id = m.Id, agentAddress = m.AgentAddress, invitedBy = invite?.inviter.Id }, statusCode: StatusCodes.Status201Created);
        });

        auth.MapPost("/login", async (LoginRequest req, Accounts accounts, HttpContext ctx) =>
        {
            var m = await accounts.LogIn(req);
            if (m is null) return Results.Json(new { error = "That email and password don't match an account." }, statusCode: StatusCodes.Status401Unauthorized);
            await SignIn(ctx, m);
            return Results.Ok(new { id = m.Id });
        });

        // ---------- development sign-in: pick a seeded member ----------
        api.MapGet("/members", async (AgenticDb db) =>
        {
            if (!devLogin) return Results.NotFound();
            var list = await db.Members.AsNoTracking().Where(m => m.Kind == "person" && m.Email == null).OrderBy(m => m.Name).ToListAsync();
            return Results.Ok(list.Select(m => new { id = m.Id, name = m.Name, headline = m.Headline, c = JsonNode.Parse(m.ProfileJson)?["c"] }));
        });

        api.MapPost("/session", async (SessionRequest req, AgenticDb db, HttpContext ctx) =>
        {
            if (!devLogin) return Results.NotFound();
            if (accessCode.Length > 0 && !CodeMatches(req.AccessCode, accessCode))
                return Results.Json(new { error = "That access code is not right." }, statusCode: StatusCodes.Status401Unauthorized);
            var m = await db.Members.FindAsync(req.MemberId ?? "");
            if (m is null || m.Kind != "person" || m.Email is not null) return Results.BadRequest(new { error = "Unknown member." });
            await SignIn(ctx, m);
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

        me.MapPut("/profile", async (ProfileUpdate req, ClaimsPrincipal user, Accounts accounts, Inbox inbox) =>
        {
            var (ok, error) = await accounts.UpdateProfile(Id(user), req);
            return ok ? Results.Json(await inbox.Bootstrap(Id(user)), Json.Web) : Results.BadRequest(new { error });
        });

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

    private static bool CodeMatches(string? given, string expected) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(given ?? ""), Encoding.UTF8.GetBytes(expected));

    private static Task SignIn(HttpContext ctx, Member m)
    {
        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, m.Id), new(ClaimTypes.Name, m.Name) };
        if (m.Email is not null) claims.Add(new Claim(ClaimTypes.Email, m.Email));
        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        return ctx.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity), new AuthenticationProperties { IsPersistent = true });
    }

    private static string Id(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier)!;
}
