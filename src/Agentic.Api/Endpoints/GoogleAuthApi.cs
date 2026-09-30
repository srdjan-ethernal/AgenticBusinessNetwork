using System.Security.Claims;
using System.Text.Json.Nodes;
using Agentic.Api.Services;
using Microsoft.AspNetCore.Authentication;

namespace Agentic.Api.Endpoints;

public sealed record ExternalSignupBody(string? Name, string? Headline, string? Location, string? Template, List<string>? Topics, string? AccessCode);

/// <summary>"Continue with Google": sign-in for members, sign-up for everyone else.
/// Google's answer lands in a short-lived "External" cookie; an existing member is signed in right away,
/// a new person finishes the sign-up form (headline, template) and <c>/api/auth/signup/external</c> creates the account.</summary>
public static class GoogleAuthApi
{
    public const string ExternalScheme = "External";
    public const string GoogleScheme = "Google";

    public static bool Configured(IConfiguration config) =>
        config["Auth:Google:ClientId"] is { Length: > 0 } && config["Auth:Google:ClientSecret"] is { Length: > 0 };

    public static void MapGoogleAuthApi(this WebApplication app)
    {
        var enabled = Configured(app.Configuration);
        var signup = app.Configuration.GetValue("Auth:Signup", true);
        var accessCode = app.Configuration["Auth:AccessCode"] ?? "";
        var g = app.MapGroup("/api/auth").RequireRateLimiting("auth");

        g.MapGet("/google", (string? invite) =>
        {
            if (!enabled) return Results.NotFound();
            var props = new AuthenticationProperties { RedirectUri = "/api/auth/google/done" };
            if (invite is { Length: > 0 and <= 64 }) props.Items["invite"] = invite;
            return Results.Challenge(props, [GoogleScheme]);
        });

        g.MapGet("/google/done", async (HttpContext ctx, Accounts accounts) =>
        {
            var (ext, _) = await Read(ctx);
            if (ext is null) { await ctx.SignOutAsync(ExternalScheme); return Results.Redirect("/#signin.google-failed"); }
            var (member, error) = await accounts.FindExternal(ext);
            if (error is not null)
            {
                await ctx.SignOutAsync(ExternalScheme);
                return Results.Redirect("/#signin." + (error.Contains("different Google") ? "google-other" : "google-password"));
            }
            if (member is not null)
            {
                await ctx.SignOutAsync(ExternalScheme);
                await AppApi.SignIn(ctx, member);
                return Results.Redirect("/#feed");
            }
            // New here: keep the Google identity for a few minutes and finish the sign-up form.
            return Results.Redirect(signup ? "/#join.google" : "/#signin.google-nosignup");
        });

        g.MapGet("/external", async (HttpContext ctx, Contacts contacts) =>
        {
            var (ext, invite) = await Read(ctx);
            if (ext is null) return Results.NotFound();
            var inv = invite is null ? null : await contacts.FindInvite(invite);
            return Results.Ok(new
            {
                provider = ext.Provider,
                name = ext.Name,
                email = ext.Email,
                headline = inv is { } i1 && i1.contact.Position is not null ? i1.contact.Position + (i1.contact.Company is not null ? " at " + i1.contact.Company : "") : null,
                invitedBy = inv is { } i2 ? new { name = i2.inviter.Name, headline = i2.inviter.Headline, c = JsonNode.Parse(i2.inviter.ProfileJson)?["c"] } : null,
                accessCodeRequired = accessCode.Length > 0 && inv is null,
            });
        });

        g.MapPost("/signup/external", async (ExternalSignupBody req, HttpContext ctx, Accounts accounts, Contacts contacts, AccountEmails emails) =>
        {
            if (!signup) return Results.NotFound();
            var (ext, inviteCode) = await Read(ctx);
            if (ext is null) return Results.Json(new { error = "Your Google sign-in expired. Choose “Continue with Google” again." }, statusCode: StatusCodes.Status401Unauthorized);
            var invite = inviteCode is null ? null : await contacts.FindInvite(inviteCode);
            if (invite is null && accessCode.Length > 0 && !AppApi.CodeMatches(req.AccessCode, accessCode))
                return Results.Json(new { error = "Sign-up is invite-only on this server. Enter the access code you received." }, statusCode: StatusCodes.Status401Unauthorized);
            var (m, status, error) = await accounts.SignUpExternal(ext, new ExternalSignupRequest(req.Name, req.Headline, req.Location, req.Template, req.Topics));
            if (m is null) return Results.Json(new { error }, statusCode: status);
            if (invite is { } inv) await contacts.Accept(inv.contact, m);
            if (!m.EmailVerified) await emails.SendVerification(m, AccountApi.BaseUrl(ctx.Request, app.Configuration));
            await ctx.SignOutAsync(ExternalScheme);
            await AppApi.SignIn(ctx, m);
            return Results.Json(new { id = m.Id, agentAddress = m.AgentAddress, invitedBy = invite?.inviter.Id }, statusCode: StatusCodes.Status201Created);
        });
    }

    /// <summary>The Google identity held in the External cookie, and the invite code carried through the round trip.</summary>
    private static async Task<(ExternalIdentity? ext, string? invite)> Read(HttpContext ctx)
    {
        var result = await ctx.AuthenticateAsync(ExternalScheme);
        if (!result.Succeeded || result.Principal is null) return (null, null);
        var p = result.Principal;
        var sub = p.FindFirstValue(ClaimTypes.NameIdentifier);
        var email = p.FindFirstValue(ClaimTypes.Email);
        if (string.IsNullOrEmpty(sub) || string.IsNullOrEmpty(email)) return (null, null);
        var verified = string.Equals(p.FindFirstValue("email_verified"), "true", StringComparison.OrdinalIgnoreCase);
        var name = p.FindFirstValue(ClaimTypes.Name) ?? email.Split('@')[0];
        result.Properties!.Items.TryGetValue("invite", out var invite);
        return (new ExternalIdentity("google", sub, email, verified, name), invite);
    }
}
