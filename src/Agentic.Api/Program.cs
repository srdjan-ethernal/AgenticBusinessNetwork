using System.Security.Claims;
using System.Threading.RateLimiting;
using Agentic.Api.Data;
using Agentic.Api.Domain;
using Agentic.Api.Endpoints;
using Agentic.Api.Services;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);

// SQLite for local development. Postgres and migrations arrive with hosting.
var conn = builder.Configuration.GetConnectionString("Default") ?? "Data Source=agentic.db";
builder.Services.AddDbContext<AgenticDb>(o => o.UseSqlite(conn));

builder.Services.AddSingleton(sp => new Catalog(Path.Combine(sp.GetRequiredService<IWebHostEnvironment>().ContentRootPath, "Seed", "domain.json")));
builder.Services.AddSingleton<PolicyEngine>();
builder.Services.AddScoped<AgentCore>();
builder.Services.AddScoped<Protocol>();
builder.Services.AddScoped<Inbox>();

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
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
    });
builder.Services.AddAuthorization();

// Unverified senders are rate-limited per IP, members per account.
var submitPerHour = builder.Configuration.GetValue("Protocol:SubmitPerHour", 30);
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("submit", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.User.Identity?.IsAuthenticated == true ? "member:" + ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) : "ip:" + ctx.Connection.RemoteIpAddress,
        _ => new FixedWindowRateLimiterOptions { PermitLimit = submitPerHour, Window = TimeSpan.FromHours(1) }));
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AgenticDb>();
    // SQLite (local dev): create the schema directly; delete agentic.db after model changes.
    db.Database.EnsureCreated();
    if (app.Configuration.GetValue("Seed:Demo", true))
        await DevSeed.RunAsync(scope.ServiceProvider.GetRequiredService<AgentCore>(), Path.Combine(app.Environment.ContentRootPath, "Seed", "demo.json"));
}

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

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

app.Run();

public partial class Program;
