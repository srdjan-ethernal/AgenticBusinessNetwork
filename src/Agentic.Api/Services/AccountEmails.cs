using System.Net;
using System.Text;
using Agentic.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Agentic.Api.Services;

/// <summary>Email address verification and password reset, both through single-use links.</summary>
public sealed class AccountEmails(AgentCore core, EmailOptions email)
{
    private AgenticDb Db => core.Db;
    public static readonly TimeSpan VerifyValid = TimeSpan.FromHours(48);
    public static readonly TimeSpan ResetValid = TimeSpan.FromHours(1);

    public async Task SendVerification(Member m, string baseUrl)
    {
        if (m.Email is null || m.EmailVerified) return;
        var token = NewToken(m, "verify", VerifyValid);
        var url = baseUrl.TrimEnd('/') + "/#verify." + token;
        var brand = core.Catalog.BrandName;
        Db.Outbox.Add(Mail.Compose("verify", m, email, "Confirm your email for " + brand,
            "Hi " + First(m) + ",",
            ["Confirm that " + m.Email + " is your address. Senders then see you as a verified member, and your agent can send you its daily digest."],
            ("Confirm my email", url),
            "The link works for 48 hours. If you didn’t create an account on " + brand + ", ignore this email."));
        await Db.SaveChangesAsync();
    }

    public async Task<(Member? member, string? error)> Verify(string? token)
    {
        var t = await Use(token, "verify");
        if (t is null) return (null, "This confirmation link has expired or was already used. Sign in and send a new one.");
        var m = await Db.Members.FindAsync(t.MemberId);
        if (m is null || m.Email != t.Email) return (null, "This confirmation link is for an address that is no longer on the account.");
        Accounts.MarkEmailVerified(m);
        await Db.SaveChangesAsync();
        return (m, null);
    }

    /// <summary>Always looks the same to the caller, whether or not the address has an account.</summary>
    public async Task RequestReset(string? address, string baseUrl)
    {
        var norm = Accounts.NormalizeEmail(address);
        var m = await Db.Members.FirstOrDefaultAsync(x => x.Email == norm);
        if (m is null) return;
        // At most three reset emails an hour for one account.
        var since = DateTime.UtcNow.AddHours(-1);
        if (await Db.EmailTokens.CountAsync(x => x.MemberId == m.Id && x.Purpose == "reset" && x.CreatedAt > since) >= 3) return;
        var token = NewToken(m, "reset", ResetValid);
        var url = baseUrl.TrimEnd('/') + "/#reset." + token;
        Db.Outbox.Add(Mail.Compose("reset", m, email, "Reset your password",
            "Hi " + First(m) + ",",
            [m.PasswordHash is null
                ? "You sign in with Google. You can also set a password for " + m.Email + " with the link below."
                : "Someone (hopefully you) asked to reset the password for " + m.Email + "."],
            ("Choose a new password", url),
            "The link works for one hour and only once. If you didn’t ask for this, ignore this email; your password stays the same."));
        await Db.SaveChangesAsync();
    }

    public async Task<(Member? member, string? error)> Reset(string? token, string? password)
    {
        if ((password ?? "").Length < 10) return (null, "Use a password of at least 10 characters.");
        if (password!.Length > 200) return (null, "That password is too long.");
        var t = await Use(token, "reset");
        if (t is null) return (null, "This reset link has expired or was already used. Ask for a new one.");
        var m = await Db.Members.FindAsync(t.MemberId);
        if (m is null || m.Email != t.Email) return (null, "This reset link is for an address that is no longer on the account.");
        m.PasswordHash = Accounts.HashPassword(password);
        // The link proved control of the address. Every other session ends, and other open reset links die.
        Accounts.MarkEmailVerified(m);
        Accounts.RotateStamp(m);
        foreach (var other in await Db.EmailTokens.Where(x => x.MemberId == m.Id && x.Purpose == "reset" && x.UsedAt == null).ToListAsync()) other.UsedAt = DateTime.UtcNow;
        await Db.SaveChangesAsync();
        return (m, null);
    }

    private string NewToken(Member m, string purpose, TimeSpan valid)
    {
        var token = AgentCore.NewToken();
        Db.EmailTokens.Add(new EmailToken
        {
            MemberId = m.Id, Purpose = purpose, TokenHash = AgentCore.HashToken(token), Email = m.Email!,
            CreatedAt = DateTime.UtcNow, ExpiresAt = DateTime.UtcNow + valid,
        });
        return token;
    }

    private async Task<EmailToken?> Use(string? token, string purpose)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 100) return null;
        var hash = AgentCore.HashToken(token);
        var t = await Db.EmailTokens.FirstOrDefaultAsync(x => x.TokenHash == hash && x.Purpose == purpose);
        if (t is null || t.UsedAt is not null || t.ExpiresAt < DateTime.UtcNow) return null;
        t.UsedAt = DateTime.UtcNow;
        return t;
    }

    private static string First(Member m) => m.Name.Split(' ')[0];
}

/// <summary>Plain text + simple HTML for the account emails.</summary>
public static class Mail
{
    public static OutboundEmail Compose(string kind, Member to, EmailOptions options, string subject, string greeting, IEnumerable<string> paragraphs,
        (string Label, string Url)? button, string footer, string? htmlBody = null, string? textBody = null, string? unsubscribeUrl = null)
    {
        var paras = paragraphs.ToList();
        var text = new StringBuilder().Append(greeting).Append("\n\n");
        foreach (var p in paras) text.Append(p).Append("\n\n");
        if (textBody is not null) text.Append(textBody).Append("\n\n");
        if (button is { } b1) text.Append(b1.Label).Append(": ").Append(b1.Url).Append("\n\n");
        text.Append(footer).Append('\n');
        if (unsubscribeUrl is not null) text.Append("Turn these emails off: ").Append(unsubscribeUrl).Append('\n');

        string H(string s) => WebUtility.HtmlEncode(s);
        var html = new StringBuilder("<!doctype html><html><body style=\"margin:0;background:#f4f6f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#15201c\">")
            .Append("<div style=\"max-width:560px;margin:0 auto;padding:32px 20px\"><div style=\"background:#fff;border:1px solid #dfe5e2;border-radius:12px;padding:28px\">")
            .Append("<p style=\"margin:0 0 16px;font-size:16px\">").Append(H(greeting)).Append("</p>");
        foreach (var p in paras) html.Append("<p style=\"margin:0 0 16px;font-size:15px;line-height:1.5;color:#3b4a44\">").Append(H(p)).Append("</p>");
        if (htmlBody is not null) html.Append(htmlBody);
        if (button is { } b2)
            html.Append("<p style=\"margin:8px 0 24px\"><a href=\"").Append(H(b2.Url)).Append("\" style=\"display:inline-block;background:#0d7a69;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px\">").Append(H(b2.Label)).Append("</a></p>");
        html.Append("<p style=\"margin:0;font-size:13px;line-height:1.5;color:#65746e\">").Append(H(footer));
        if (unsubscribeUrl is not null) html.Append("<br><a href=\"").Append(H(unsubscribeUrl)).Append("\" style=\"color:#65746e\">Turn these emails off</a>");
        html.Append("</p></div></div></body></html>");

        return new OutboundEmail
        {
            Kind = kind, OwnerId = to.Id, To = to.Email!, FromName = options.FromName, Subject = subject,
            Text = text.ToString(), Html = html.ToString(), UnsubscribeUrl = unsubscribeUrl, CreatedAt = DateTime.UtcNow,
        };
    }
}
