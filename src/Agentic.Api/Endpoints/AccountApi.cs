using System.Security.Claims;
using Agentic.Api.Data;
using Agentic.Api.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace Agentic.Api.Endpoints;

public sealed record TokenBody(string? Token);
public sealed record EmailBody(string? Email);
public sealed record ResetBody(string? Token, string? Password);
public sealed record PasswordBody(string? Current, string? Password);
public sealed record DigestBody(bool Enabled);

/// <summary>Email verification, password reset, account settings and the daily digest switch.</summary>
public static class AccountApi
{
    public static string BaseUrl(HttpRequest r, IConfiguration config) =>
        config["App:PublicUrl"] is { Length: > 0 } u ? u : r.Scheme + "://" + r.Host;

    public static void MapAccountApi(this WebApplication app)
    {
        var config = app.Configuration;
        var pub = app.MapGroup("/api/auth").RequireRateLimiting("auth");

        pub.MapPost("/verify", async (TokenBody body, AccountEmails emails) =>
        {
            var (m, error) = await emails.Verify(body.Token);
            return m is null ? Results.BadRequest(new { error }) : Results.Ok(new { email = m.Email, workEmail = m.Verified.Contains("work_email") });
        });

        // Same answer whether or not the address has an account.
        pub.MapPost("/reset/request", async (EmailBody body, HttpRequest req, AccountEmails emails) =>
        {
            await emails.RequestReset(body.Email, BaseUrl(req, config));
            return Results.Ok(new { ok = true });
        });

        pub.MapPost("/reset", async (ResetBody body, HttpContext ctx, AccountEmails emails) =>
        {
            var (m, error) = await emails.Reset(body.Token, body.Password);
            if (m is null) return Results.BadRequest(new { error });
            await AppApi.SignIn(ctx, m);
            return Results.Ok(new { id = m.Id });
        });

        app.MapPost("/api/digest/off", async (TokenBody body, AgenticDb db) =>
        {
            if (string.IsNullOrWhiteSpace(body.Token) || body.Token.Length > 100) return Results.NotFound();
            var m = db.Members.FirstOrDefault(x => x.DigestToken == body.Token);
            if (m is null) return Results.NotFound();
            m.DigestEnabled = false;
            await db.SaveChangesAsync();
            return Results.Ok(new { ok = true });
        }).RequireRateLimiting("auth");

        var me = app.MapGroup("/api/account").RequireAuthorization();

        me.MapGet("", async (ClaimsPrincipal user, AgenticDb db, IEmailSender sender) =>
        {
            var m = await db.Members.FindAsync(Id(user));
            return m is null ? Results.NotFound() : Results.Ok(View(m, sender));
        });

        me.MapPost("/verify/resend", async (ClaimsPrincipal user, HttpRequest req, AgenticDb db, AccountEmails emails) =>
        {
            var m = await db.Members.FindAsync(Id(user));
            if (m?.Email is null) return Results.BadRequest(new { error = "This account has no email address." });
            if (m.EmailVerified) return Results.Conflict(new { error = "Your email is already confirmed." });
            await emails.SendVerification(m, BaseUrl(req, config));
            return Results.Ok(new { sentTo = m.Email });
        }).RequireRateLimiting("auth");

        me.MapPut("/password", async (PasswordBody body, ClaimsPrincipal user, HttpContext ctx, AgenticDb db, Accounts accounts) =>
        {
            var m = await db.Members.FindAsync(Id(user));
            if (m?.Email is null) return Results.BadRequest(new { error = "Development accounts have no password." });
            var (ok, error) = await accounts.ChangePassword(m, body.Current, body.Password);
            if (!ok) return Results.BadRequest(new { error });
            await AppApi.SignIn(ctx, m);   // this browser stays signed in; every other session ends
            return Results.Ok(new { ok = true });
        }).RequireRateLimiting("auth");

        me.MapPost("/signout-all", async (ClaimsPrincipal user, HttpContext ctx, AgenticDb db) =>
        {
            var m = await db.Members.FindAsync(Id(user));
            if (m is null) return Results.NotFound();
            Accounts.RotateStamp(m);
            await db.SaveChangesAsync();
            await AppApi.SignIn(ctx, m);
            return Results.Ok(new { ok = true });
        });

        me.MapPut("/digest", async (DigestBody body, ClaimsPrincipal user, AgenticDb db, IEmailSender sender) =>
        {
            var m = await db.Members.FindAsync(Id(user));
            if (m is null) return Results.NotFound();
            m.DigestEnabled = body.Enabled;
            await db.SaveChangesAsync();
            return Results.Ok(View(m, sender));
        });

        // "Send me one now", to see what it looks like. Counts as today's digest.
        me.MapPost("/digest/send", async (ClaimsPrincipal user, AgenticDb db, Digests digests) =>
        {
            var m = await db.Members.FindAsync(Id(user));
            if (m?.Email is null || !m.EmailVerified) return Results.BadRequest(new { error = "Confirm your email first." });
            await digests.Queue(m, DateTime.UtcNow, force: true);
            return Results.Ok(new { sentTo = m.Email });
        }).RequireRateLimiting("auth");
    }

    private static object View(Member m, IEmailSender sender) => new
    {
        email = m.Email,
        emailVerified = m.EmailVerified,
        workEmail = m.Verified.Contains("work_email"),
        hasPassword = m.PasswordHash is not null,
        google = m.GoogleSubject is not null,
        digestEnabled = m.DigestEnabled,
        lastDigestAt = m.LastDigestAt,
        emailDelivers = sender.Delivers,
        devAccount = m.Email is null,
    };

    /// <summary>Cookie check on every request: a session from before a password reset or "sign out everywhere" ends.</summary>
    public static async Task ValidateStamp(CookieValidatePrincipalContext ctx)
    {
        var id = ctx.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (id is null) return;
        var db = ctx.HttpContext.RequestServices.GetRequiredService<AgenticDb>();
        var stamp = db.Members.Where(m => m.Id == id).Select(m => new { m.SecurityStamp }).FirstOrDefault();
        if (stamp is null || (stamp.SecurityStamp ?? "") != (ctx.Principal!.FindFirstValue(AppApi.StampClaim) ?? ""))
        {
            ctx.RejectPrincipal();
            await ctx.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        }
    }

    private static string Id(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier)!;
}
