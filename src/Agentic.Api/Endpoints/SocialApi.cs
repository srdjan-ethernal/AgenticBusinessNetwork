using System.Security.Claims;
using Agentic.Api.Data;
using Agentic.Api.Services;

namespace Agentic.Api.Endpoints;

public sealed record ConnectBody(string? MemberId, string? Note);
public sealed record RespondBody(bool Accept);
public sealed record TextBody(string? Text);

/// <summary>Connections, posts, feed, likes, comments and notifications (signed-in members only).</summary>
public static class SocialApi
{
    public static void MapSocialApi(this WebApplication app)
    {
        var api = app.MapGroup("/api").RequireAuthorization();

        api.MapGet("/social/summary", async (ClaimsPrincipal user, Social social, AgenticDb db) =>
        {
            var me = Id(user);
            var requests = db.ConnectionRequests.Count(r => r.ToId == me && r.Status == "pending");
            return Results.Ok(new { requestsIn = requests, unread = await social.Unread(me), connections = (await social.ConnectionIds(me)).Count });
        });

        // ---------- connections ----------
        api.MapPost("/connections", async (ConnectBody body, ClaimsPrincipal user, Social social, AgenticDb db) =>
        {
            var me = await db.Members.FindAsync(Id(user));
            if (me?.Kind != "person") return Results.BadRequest(new { error = "Company pages can’t send connection requests." });
            var (state, error) = await social.Connect(me.Id, body.MemberId ?? "", body.Note);
            return error is not null ? Results.BadRequest(new { error }) : Results.Ok(new { state });
        });
        api.MapGet("/connections/requests", async (ClaimsPrincipal user, Social social) => Results.Ok(await social.Requests(Id(user))));
        api.MapPost("/connections/requests/{id:long}", async (long id, RespondBody body, ClaimsPrincipal user, Social social) =>
            await social.Respond(Id(user), id, body.Accept) is { } error ? Results.BadRequest(new { error }) : Results.Ok(new { ok = true }));
        api.MapDelete("/connections/{memberId}", async (string memberId, ClaimsPrincipal user, Social social) =>
        {
            await social.Disconnect(Id(user), memberId);
            return Results.Ok(new { ok = true });
        });

        // ---------- posts ----------
        api.MapGet("/feed", async (long? before, ClaimsPrincipal user, Social social) => Results.Ok(await social.Feed(Id(user), before)));
        api.MapGet("/members/{id}/posts", async (string id, long? before, ClaimsPrincipal user, Social social) => Results.Ok(await social.ByAuthor(Id(user), id, before)));

        api.MapPost("/posts", async (TextBody body, ClaimsPrincipal user, Social social) =>
        {
            var (post, error) = await social.CreatePost(Id(user), body.Text);
            return post is null ? Results.BadRequest(new { error }) : Results.Json(new { id = post.Id }, statusCode: StatusCodes.Status201Created);
        });
        api.MapGet("/posts/{id:long}", async (long id, ClaimsPrincipal user, Social social) =>
            await social.One(Id(user), id) is { } post ? Results.Ok(post) : Results.NotFound());
        // The image is the request body (application/octet-stream), resized in the browser; JPEG, PNG or WebP only.
        api.MapPost("/posts/{id:long}/image", async (long id, HttpRequest req, ClaimsPrincipal user, Social social) =>
        {
            if (req.ContentLength > Social.MaxImage) return Results.BadRequest(new { error = "Choose an image under 2 MB." });
            using var ms = new MemoryStream();
            await req.Body.CopyToAsync(ms);
            if (ms.Length == 0 || ms.Length > Social.MaxImage) return Results.BadRequest(new { error = "Choose an image under 2 MB." });
            var bytes = ms.ToArray();
            var type = ProfileApi.ImageType(bytes);
            if (type is null) return Results.BadRequest(new { error = "Use a JPEG, PNG or WebP image." });
            return await social.SetImage(Id(user), id, bytes, type) is { } error ? Results.BadRequest(new { error }) : Results.Ok(new { ok = true });
        });
        api.MapGet("/posts/{id:long}/image", async (long id, Social social, HttpContext ctx) =>
        {
            if (await social.Image(id) is not { } img) return Results.NotFound();
            ctx.Response.Headers.CacheControl = "private, max-age=86400";
            ctx.Response.Headers.XContentTypeOptions = "nosniff";
            return Results.File(img.bytes, img.type);
        });
        api.MapDelete("/posts/{id:long}", async (long id, ClaimsPrincipal user, Social social) =>
            await social.DeletePost(Id(user), id) ? Results.Ok(new { ok = true }) : Results.NotFound());

        api.MapPost("/posts/{id:long}/like", async (long id, ClaimsPrincipal user, Social social) =>
            await social.ToggleLike(Id(user), id) is { } r ? Results.Ok(new { liked = r.liked, likes = r.count }) : Results.NotFound());
        api.MapGet("/posts/{id:long}/comments", async (long id, Social social) =>
            await social.Comments(id) is { } list ? Results.Ok(list) : Results.NotFound());
        api.MapPost("/posts/{id:long}/comments", async (long id, TextBody body, ClaimsPrincipal user, Social social) =>
            await social.AddComment(Id(user), id, body.Text) is { } error ? Results.BadRequest(new { error }) : Results.Ok(await social.Comments(id)));
        api.MapDelete("/comments/{id:long}", async (long id, ClaimsPrincipal user, Social social) =>
            await social.DeleteComment(Id(user), id) ? Results.Ok(new { ok = true }) : Results.NotFound());

        // ---------- notifications ----------
        api.MapGet("/notifications", async (ClaimsPrincipal user, Social social) => Results.Ok(await social.Notifications(Id(user))));
        api.MapPost("/notifications/read", async (ClaimsPrincipal user, Social social) =>
        {
            await social.MarkRead(Id(user));
            return Results.Ok(new { ok = true });
        });
    }

    private static string Id(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier)!;
}
