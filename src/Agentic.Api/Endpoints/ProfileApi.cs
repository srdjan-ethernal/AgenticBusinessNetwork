using System.Security.Claims;
using System.Text.Json.Nodes;
using Agentic.Api.Data;
using Agentic.Api.Domain;
using Agentic.Api.Services;

namespace Agentic.Api.Endpoints;

/// <summary>Profile photo and "fill my profile from LinkedIn".</summary>
public static class ProfileApi
{
    public const int MaxPhotoBytes = 1024 * 1024;

    public static void MapProfileApi(this WebApplication app)
    {
        // Photos are public, like the profile itself. The URL carries a version, so browsers can cache it for good.
        app.MapGet("/api/members/{id}/photo", async (string id, AgenticDb db, HttpContext ctx) =>
        {
            var photo = await db.Photos.FindAsync(id);
            if (photo is null) return Results.NotFound();
            ctx.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
            ctx.Response.Headers.XContentTypeOptions = "nosniff";
            return Results.File(photo.Bytes, photo.ContentType);
        });

        var me = app.MapGroup("/api/profile").RequireAuthorization();

        // The body is the image itself, resized and cropped in the browser (application/octet-stream).
        me.MapPost("/photo", async (HttpRequest req, ClaimsPrincipal user, AgenticDb db, Inbox inbox) =>
        {
            var bytes = await ReadBody(req, MaxPhotoBytes);
            if (bytes is null) return Results.BadRequest(new { error = "Choose an image under 1 MB." });
            var type = ImageType(bytes);
            if (type is null) return Results.BadRequest(new { error = "Use a JPEG, PNG or WebP image." });
            var id = Id(user);
            var m = await db.Members.FindAsync(id);
            if (m is null) return Results.NotFound();
            var photo = await db.Photos.FindAsync(id);
            if (photo is null) db.Photos.Add(photo = new MemberPhoto { MemberId = id });
            photo.Bytes = bytes;
            photo.ContentType = type;
            photo.UpdatedAt = DateTime.UtcNow;
            SetPhotoUrl(m, "api/members/" + Uri.EscapeDataString(id) + "/photo?v=" + photo.UpdatedAt.Ticks);
            await db.SaveChangesAsync();
            return Results.Json(await inbox.Bootstrap(id), Json.Web);
        });

        me.MapDelete("/photo", async (ClaimsPrincipal user, AgenticDb db, Inbox inbox) =>
        {
            var id = Id(user);
            var m = await db.Members.FindAsync(id);
            if (m is null) return Results.NotFound();
            if (await db.Photos.FindAsync(id) is { } photo) db.Photos.Remove(photo);
            SetPhotoUrl(m, null);
            await db.SaveChangesAsync();
            return Results.Json(await inbox.Bootstrap(id), Json.Web);
        });

        // Reads the member's own LinkedIn export and returns what it found. Nothing is saved until the
        // member picks what to keep and saves it with PUT /api/profile.
        me.MapPost("/linkedin", async (HttpRequest req) =>
        {
            if (!string.Equals(req.ContentType, "application/octet-stream", StringComparison.OrdinalIgnoreCase))
                return Results.Json(new { error = "Upload the file as application/octet-stream." }, statusCode: StatusCodes.Status415UnsupportedMediaType);
            var bytes = await ReadBody(req, ContactsApi.MaxUploadBytes);
            if (bytes is null) return Results.BadRequest(new { error = "That file is larger than 25 MB." });
            var (data, error) = LinkedInProfile.Read(bytes);
            return data is null ? Results.BadRequest(new { error }) : Results.Json(data, Json.Web);
        });
    }

    private static void SetPhotoUrl(Member m, string? url)
    {
        var p = JsonNode.Parse(m.ProfileJson) as JsonObject ?? [];
        if (url is null) p.Remove("photo"); else p["photo"] = url;
        m.ProfileJson = p.ToJsonString();
    }

    /// <summary>Only formats a browser shows as a plain image; never SVG or anything that can carry script.</summary>
    public static string? ImageType(byte[] b)
    {
        if (b.Length > 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return "image/jpeg";
        if (b.Length > 8 && b[0] == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') return "image/png";
        if (b.Length > 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return "image/webp";
        return null;
    }

    private static async Task<byte[]?> ReadBody(HttpRequest req, int max)
    {
        if (req.ContentLength > max) return null;
        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = await req.Body.ReadAsync(chunk)) > 0)
        {
            buffer.Write(chunk, 0, read);
            if (buffer.Length > max) return null;
        }
        return buffer.Length == 0 ? null : buffer.ToArray();
    }

    private static string Id(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier)!;
}

/// <summary>Find people and businesses (signed-in members only).</summary>
public static class DirectoryApi
{
    public static void MapDirectoryApi(this WebApplication app)
    {
        var g = app.MapGroup("/api/directory").RequireAuthorization();
        g.MapGet("", async (string? q, string? industry, ClaimsPrincipal user, MemberDirectory dir) =>
            Results.Json(await dir.Search(user.FindFirstValue(ClaimTypes.NameIdentifier)!, q, industry), Json.Web));
        g.MapGet("/matches", async (ClaimsPrincipal user, MemberDirectory dir) =>
            Results.Json(await dir.Matches(user.FindFirstValue(ClaimTypes.NameIdentifier)!), Json.Web));
    }
}
