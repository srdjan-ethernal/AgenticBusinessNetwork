using System.Security.Claims;
using System.Text.Json.Nodes;
using Agentic.Api.Services;

namespace Agentic.Api.Endpoints;

/// <summary>Import LinkedIn connections and invite them; the invited person's side of the link.</summary>
public static class ContactsApi
{
    public const int MaxUploadBytes = 25 * 1024 * 1024;

    public static void MapContactsApi(this WebApplication app)
    {
        var publicUrl = app.Configuration["App:PublicUrl"];
        string BaseUrl(HttpRequest r) => publicUrl is { Length: > 0 } ? publicUrl : r.Scheme + "://" + r.Host;
        var dev = app.Environment.IsDevelopment();

        var me = app.MapGroup("/api/contacts").RequireAuthorization();

        me.MapGet("", async (ClaimsPrincipal user, Contacts contacts, IEmailSender sender) =>
            Results.Ok(await contacts.List(Id(user), sender.Delivers)));

        // The body is the uploaded file itself (LinkedIn's .zip archive or Connections.csv), sent as
        // application/octet-stream: that is never a "simple" cross-site request, so no CSRF form can post it.
        me.MapPost("/import", async (HttpRequest req, ClaimsPrincipal user, Contacts contacts) =>
        {
            if (!string.Equals(req.ContentType, "application/octet-stream", StringComparison.OrdinalIgnoreCase))
                return Results.Json(new { error = "Upload the file as application/octet-stream." }, statusCode: StatusCodes.Status415UnsupportedMediaType);
            if (req.ContentLength > MaxUploadBytes) return Results.BadRequest(new { error = "That file is larger than 25 MB." });
            using var buffer = new MemoryStream();
            var chunk = new byte[81920];
            int read;
            while ((read = await req.Body.ReadAsync(chunk)) > 0)
            {
                buffer.Write(chunk, 0, read);
                if (buffer.Length > MaxUploadBytes) return Results.BadRequest(new { error = "That file is larger than 25 MB." });
            }
            var (result, error) = await contacts.Import(Id(user), buffer.ToArray());
            return result is null ? Results.BadRequest(new { error }) : Results.Ok(result);
        });

        me.MapPost("/invite", async (InviteRequest body, HttpRequest req, ClaimsPrincipal user, Contacts contacts, IEmailSender sender) =>
        {
            // Without SMTP a production server would only pretend to send.
            if (!sender.Delivers && !dev)
                return Results.Json(new { error = "Email isn’t set up on this server yet, so invitations can’t be sent. Copy personal invite links instead." }, statusCode: StatusCodes.Status409Conflict);
            var (result, error) = await contacts.Invite(Id(user), body, BaseUrl(req));
            return result is null ? Results.BadRequest(new { error }) : Results.Ok(result);
        }).RequireRateLimiting("invite");

        me.MapGet("/search", async (string? q, ClaimsPrincipal user, Contacts contacts) =>
            Results.Ok(await contacts.Search(Id(user), q)));

        me.MapPost("/{id:int}/link", async (int id, HttpRequest req, ClaimsPrincipal user, Contacts contacts) =>
            await contacts.Link(Id(user), id, BaseUrl(req)) is { } link ? Results.Ok(link) : Results.NotFound());

        me.MapDelete("", async (ClaimsPrincipal user, Contacts contacts) =>
            Results.Ok(new { deleted = await contacts.DeleteAll(Id(user)) }));

        // ---------- public: the person who received the invitation ----------

        var inv = app.MapGroup("/api/invites").RequireRateLimiting("auth");

        inv.MapGet("/{code}", async (string code, Contacts contacts) =>
        {
            if (await contacts.FindInvite(code) is not { } found) return Results.Json(new { error = "This invitation has already been used or is no longer valid." }, statusCode: StatusCodes.Status410Gone);
            var (c, inviter) = found;
            return Results.Ok(new
            {
                first = c.FirstName,
                last = c.LastName,
                email = c.Email,
                headline = c.Position is not null && c.Company is not null ? c.Position + " at " + c.Company : c.Position,
                inviter = new { id = inviter.Id, name = inviter.Name, headline = inviter.Headline, c = JsonNode.Parse(inviter.ProfileJson)?["c"] },
            });
        });

        inv.MapPost("/{code}/optout", async (string code, Contacts contacts) =>
            await contacts.OptOut(code) ? Results.Ok(new { ok = true }) : Results.NotFound());
    }

    private static string Id(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier)!;
}
