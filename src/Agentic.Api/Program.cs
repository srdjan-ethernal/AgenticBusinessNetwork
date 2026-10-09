using Microsoft.AspNetCore.Authentication;
using System.Security.Claims;
using System.Threading.RateLimiting;
using Agentic.Api.Data;
using Agentic.Api.Domain;
using Agentic.Api.Endpoints;
using Agentic.Api.Services;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;

// Container health probe: `dotnet Agentic.Api.dll --healthcheck` (the runtime image has no curl).
if (args.Contains("--healthcheck"))
{
    using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };
    try { return (await http.GetAsync("http://127.0.0.1:8080/api/health")).IsSuccessStatusCode ? 0 : 1; }
    catch (HttpRequestException) { return 1; }
    catch (TaskCanceledException) { return 1; }
}

var builder = WebApplication.CreateBuilder(args);

// SQLite, schema managed by EF Core migrations (src/Agentic.Api/Migrations).
var conn = builder.Configuration.GetConnectionString("Default") ?? "Data Source=agentic.db";
builder.Services.AddDbContext<AgenticDb>(o => o.UseSqlite(conn));

builder.Services.AddSingleton(sp => new Catalog(Path.Combine(sp.GetRequiredService<IWebHostEnvironment>().ContentRootPath, "Seed", "domain.json")));
builder.Services.AddSingleton<PolicyEngine>();
builder.Services.AddScoped<AgentCore>();
builder.Services.AddScoped<Protocol>();
builder.Services.AddScoped<Inbox>();
builder.Services.AddScoped<Accounts>();
builder.Services.AddScoped<Contacts>();
builder.Services.AddScoped<MemberDirectory>();
builder.Services.AddScoped<Companies>();
builder.Services.AddScoped<AccountEmails>();
builder.Services.AddScoped<Digests>();
builder.Services.AddSingleton<DigestWorker>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<DigestWorker>());

// Claude writes briefs and reads free-text intents when ANTHROPIC_API_KEY is set; without it the deterministic
// brief and the browser's heuristic parser are used. Routing never depends on the model.
if (builder.Configuration["ANTHROPIC_API_KEY"] is { Length: > 0 }) builder.Services.AddSingleton<IAgentModel, ClaudeAgentModel>();
else builder.Services.AddSingleton<IAgentModel, NoAgentModel>();
builder.Services.AddSingleton<BriefWorker>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<BriefWorker>());

// Email: SMTP when Email:Smtp:Host is set, otherwise mails are only written to the log.
var emailOptions = builder.Configuration.GetSection("Email").Get<EmailOptions>() ?? new EmailOptions();
builder.Services.AddSingleton(emailOptions);
if (emailOptions.Smtp.Host.Length > 0) builder.Services.AddSingleton<IEmailSender, SmtpEmailSender>();
else builder.Services.AddSingleton<IEmailSender, LogEmailSender>();
builder.Services.AddSingleton<EmailDispatcher>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<EmailDispatcher>());

// Persist cookie-encryption keys so sessions survive container restarts and redeploys.
if (builder.Configuration["DATA_PROTECTION_PATH"] is { Length: > 0 } dpPath)
    builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(dpPath)).SetApplicationName("AgenticBusinessNetwork");

// Behind Caddy: trust X-Forwarded-* so rate limits see the real client IP and cookies know the scheme.
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
});

var authBuilder = builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.Cookie.Name = "abn_auth";
        o.Cookie.HttpOnly = true;
        o.Cookie.SameSite = SameSiteMode.Lax;
        o.ExpireTimeSpan = TimeSpan.FromDays(14);
        o.SlidingExpiration = true;
        // JSON API: answer 401/403 instead of redirecting to a login page.
        o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
        o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; };
        o.Events.OnValidatePrincipal = AccountApi.ValidateStamp;
    });

// "Continue with Google" (when Auth:Google:ClientId and ClientSecret are set). Google's answer is kept for
// 15 minutes in its own cookie until the member is signed in or finishes the sign-up form.
authBuilder.AddCookie(GoogleAuthApi.ExternalScheme, o =>
{
    o.Cookie.Name = "abn_ext";
    o.Cookie.HttpOnly = true;
    o.Cookie.SameSite = SameSiteMode.Lax;
    o.ExpireTimeSpan = TimeSpan.FromMinutes(15);
    o.SlidingExpiration = false;
});
if (GoogleAuthApi.Configured(builder.Configuration))
    authBuilder.AddGoogle(GoogleAuthApi.GoogleScheme, o =>
    {
        o.ClientId = builder.Configuration["Auth:Google:ClientId"]!;
        o.ClientSecret = builder.Configuration["Auth:Google:ClientSecret"]!;
        o.SignInScheme = GoogleAuthApi.ExternalScheme;
        o.ClaimActions.MapJsonKey("email_verified", "verified_email");
        o.ClaimActions.MapJsonKey("email_verified", "email_verified");
        // Cancelled on Google's page, or anything else went wrong: back to the sign-in screen.
        o.Events.OnRemoteFailure = ctx =>
        {
            ctx.Response.Redirect("/#signin.google-cancelled");
            ctx.HandleResponse();
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorization();

// Unverified senders are rate-limited per IP, members per account.
var submitPerHour = builder.Configuration.GetValue("Protocol:SubmitPerHour", 30);
var authPer10Min = builder.Configuration.GetValue("Auth:AttemptsPer10Min", 20);
var parsePerHour = builder.Configuration.GetValue("Ai:ParsePerHour", 20);
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("submit", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.User.Identity?.IsAuthenticated == true ? "member:" + ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) : "ip:" + ctx.Connection.RemoteIpAddress,
        _ => new FixedWindowRateLimiterOptions { PermitLimit = submitPerHour, Window = TimeSpan.FromHours(1) }));
    // Free-text parsing costs a model call: per member, or per IP for senders without an account.
    o.AddPolicy("parse", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.User.Identity?.IsAuthenticated == true ? "member:" + ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) : "ip:" + ctx.Connection.RemoteIpAddress,
        _ => new FixedWindowRateLimiterOptions { PermitLimit = parsePerHour, Window = TimeSpan.FromHours(1) }));
    // Invitation batches, per member.
    o.AddPolicy("invite", ctx => RateLimitPartition.GetFixedWindowLimiter("member:" + ctx.User.FindFirstValue(ClaimTypes.NameIdentifier),
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromHours(1) }));
    // Sign-up and password attempts, per IP.
    o.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter("ip:" + ctx.Connection.RemoteIpAddress,
        _ => new FixedWindowRateLimiterOptions { PermitLimit = authPer10Min, Window = TimeSpan.FromMinutes(10) }));
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AgenticDb>();
    db.Database.Migrate();
    // One-off maintenance: `dotnet Agentic.Api.dll --remove-demo` deletes the fictional demo network and exits.
    if (args.Contains("--remove-demo"))
    {
        var removed = await DemoCleanup.Run(db);
        Console.WriteLine($"Removed the demo network: {removed.Members} members, {removed.Intents} intents, {removed.Organizations} organizations, {removed.Relationships} relationships. Real accounts were kept.");
        return 0;
    }
    if (app.Configuration.GetValue("Seed:Demo", true))
        await DevSeed.RunAsync(scope.ServiceProvider.GetRequiredService<AgentCore>(), Path.Combine(app.Environment.ContentRootPath, "Seed", "demo.json"));
}

app.UseForwardedHeaders();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
// Company admins act as their company with the X-Act-As header (inbox, policy, profile, searches).
app.Use((ctx, next) => CompaniesApi.ActAs(ctx, () => next(ctx)));

// The web client lives at the repository root; it is also the static prototype on GitHub Pages.
// Only index.html, css/ and js/ are served, never the rest of the repository.
var webRoot = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, app.Configuration["Frontend:Root"] ?? "../.."));
foreach (var dir in new[] { "css", "js" })
{
    var path = Path.Combine(webRoot, dir);
    if (Directory.Exists(path))
        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = new PhysicalFileProvider(path),
            RequestPath = "/" + dir,
            OnPrepareResponse = c => c.Context.Response.Headers.CacheControl = "no-cache",
        });
}
var indexHtml = Path.Combine(webRoot, "index.html");
app.MapGet("/", () => File.Exists(indexHtml) ? Results.File(indexHtml, "text/html; charset=utf-8") : Results.NotFound());

app.MapAppApi();
app.MapProtocolApi();
app.MapContactsApi();
app.MapGoogleAuthApi();
app.MapAccountApi();
app.MapProfileApi();
app.MapDirectoryApi();
app.MapCompaniesApi();

app.Run();
return 0;

public partial class Program;
