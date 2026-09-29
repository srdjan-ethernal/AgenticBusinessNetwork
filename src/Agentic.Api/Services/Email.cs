using Agentic.Api.Data;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.EntityFrameworkCore;
using MimeKit;

namespace Agentic.Api.Services;

public interface IEmailSender
{
    /// <summary>True when mail really leaves the server (SMTP configured).</summary>
    bool Delivers { get; }
    Task SendAsync(OutboundEmail mail, CancellationToken ct);
}

/// <summary>SMTP settings, section <c>Email</c>. Without <c>Email:Smtp:Host</c> nothing is sent; mails are only logged.</summary>
public sealed class EmailOptions
{
    public string FromAddress { get; set; } = "no-reply@localhost";
    public string FromName { get; set; } = "Agentic Business Network";
    public SmtpOptions Smtp { get; set; } = new();
    /// <summary>How often the dispatcher looks for queued mail, and the pause between two sends.</summary>
    public int PollMs { get; set; } = 5000;
    public int DelayMs { get; set; } = 400;
    public int MaxAttempts { get; set; } = 3;

    public sealed class SmtpOptions
    {
        public string Host { get; set; } = "";
        public int Port { get; set; } = 587;
        public string User { get; set; } = "";
        public string Password { get; set; } = "";
    }
}

public sealed class SmtpEmailSender(EmailOptions options) : IEmailSender
{
    public bool Delivers => true;

    public async Task SendAsync(OutboundEmail mail, CancellationToken ct)
    {
        var msg = new MimeMessage();
        msg.From.Add(new MailboxAddress(mail.FromName, options.FromAddress));
        msg.To.Add(MailboxAddress.Parse(mail.To));
        if (mail.ReplyTo is not null) msg.ReplyTo.Add(MailboxAddress.Parse(mail.ReplyTo));
        msg.Subject = mail.Subject;
        if (mail.UnsubscribeUrl is not null)
        {
            msg.Headers.Add("List-Unsubscribe", "<" + mail.UnsubscribeUrl + ">");
        }
        msg.Body = new BodyBuilder { TextBody = mail.Text, HtmlBody = mail.Html }.ToMessageBody();

        using var smtp = new SmtpClient();
        var security = options.Smtp.Port == 465 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls;
        await smtp.ConnectAsync(options.Smtp.Host, options.Smtp.Port, security, ct);
        if (options.Smtp.User.Length > 0) await smtp.AuthenticateAsync(options.Smtp.User, options.Smtp.Password, ct);
        await smtp.SendAsync(msg, ct);
        await smtp.DisconnectAsync(true, ct);
    }
}

/// <summary>Development: writes the mail to the log instead of sending it.</summary>
public sealed class LogEmailSender(ILogger<LogEmailSender> log) : IEmailSender
{
    public bool Delivers => false;

    public Task SendAsync(OutboundEmail mail, CancellationToken ct)
    {
        log.LogInformation("Email not sent (no SMTP configured) to {To}: {Subject}\n{Text}", mail.To, mail.Subject, mail.Text);
        return Task.CompletedTask;
    }
}

/// <summary>Sends queued mail one by one with a pause in between, retrying failures a few times.</summary>
public sealed class EmailDispatcher(IServiceScopeFactory scopes, IEmailSender sender, EmailOptions options, ILogger<EmailDispatcher> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await DispatchPending(stoppingToken); }
            catch (Exception e) when (e is not OperationCanceledException) { log.LogError(e, "Email dispatch failed"); }
            try { await Task.Delay(options.PollMs, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }

    public async Task<int> DispatchPending(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AgenticDb>();
        var batch = await db.Outbox.Where(m => m.Status == "pending").OrderBy(m => m.Id).Take(50).ToListAsync(ct);
        foreach (var mail in batch)
        {
            mail.Attempts++;
            try
            {
                await sender.SendAsync(mail, ct);
                mail.Status = "sent";
                mail.SentAt = DateTime.UtcNow;
                mail.Error = null;
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                mail.Error = e.Message.Length > 500 ? e.Message[..500] : e.Message;
                if (mail.Attempts >= options.MaxAttempts) mail.Status = "failed";
                log.LogWarning("Email {Id} to {To} failed (attempt {Attempt}): {Error}", mail.Id, mail.To, mail.Attempts, mail.Error);
            }
            await db.SaveChangesAsync(ct);
            if (options.DelayMs > 0) await Task.Delay(options.DelayMs, ct);
        }
        return batch.Count;
    }
}
