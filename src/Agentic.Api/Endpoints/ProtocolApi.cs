using System.Security.Claims;
using System.Text.Json;
using Agentic.Api.Domain;
using Agentic.Api.Services;

namespace Agentic.Api.Endpoints;

/// <summary>Business Intent Protocol v0.1 (snake_case JSON). Senders don't need an account.</summary>
public static class ProtocolApi
{
    public static void MapProtocolApi(this WebApplication app)
    {
        var v1 = app.MapGroup("/v1");

        v1.MapGet("/agents/{address}/card", async (string address, Protocol protocol) =>
            await protocol.AgentCard(address) is { } card
                ? Results.Json(card, Json.Protocol)
                : Error(404, "unknown_recipient", "No agent answers at " + address + "."));

        v1.MapPost("/intents", async (HttpContext ctx, Protocol protocol) =>
        {
            if (!ctx.Request.HasJsonContentType()) return Error(415, "unsupported_media_type", "Send the intent as application/json.");
            IntentSubmission? req;
            try { req = await JsonSerializer.DeserializeAsync<IntentSubmission>(ctx.Request.Body, Json.Protocol); }
            catch (JsonException) { return Error(400, "invalid_json", "The body is not valid JSON."); }
            if (req is null) return Error(400, "invalid_json", "The body is empty.");
            var (status, body) = await protocol.Submit(req, MemberId(ctx.User));
            return Results.Json(body, Json.Protocol, statusCode: status);
        }).RequireRateLimiting("submit");

        v1.MapGet("/intents/{id}", async (string id, HttpContext ctx, Protocol protocol) =>
        {
            var it = await protocol.FindForSender(id, Token(ctx), MemberId(ctx.User));
            return it is null
                ? Error(404, "not_found", "No intent with that id for this sender token.")
                : Results.Json(await protocol.View(it, null), Json.Protocol);
        });

        v1.MapPost("/intents/{id}/answers", async (string id, HttpContext ctx, Protocol protocol) =>
        {
            if (!ctx.Request.HasJsonContentType()) return Error(415, "unsupported_media_type", "Send answers as application/json.");
            var it = await protocol.FindForSender(id, Token(ctx), MemberId(ctx.User));
            if (it is null) return Error(404, "not_found", "No intent with that id for this sender token.");
            AnswerSubmission? req;
            try { req = await JsonSerializer.DeserializeAsync<AnswerSubmission>(ctx.Request.Body, Json.Protocol); }
            catch (JsonException) { return Error(400, "invalid_json", "The body is not valid JSON."); }
            var (status, body) = await protocol.Answer(it, req ?? new AnswerSubmission());
            return Results.Json(body, Json.Protocol, statusCode: status);
        }).RequireRateLimiting("submit");
    }

    private static IResult Error(int status, string code, string message) => Results.Json(new ProtocolError(code, message), Json.Protocol, statusCode: status);

    private static string? MemberId(ClaimsPrincipal user) => user.Identity?.IsAuthenticated == true ? user.FindFirstValue(ClaimTypes.NameIdentifier) : null;

    /// <summary>The sender token comes back from POST /v1/intents; send it as a bearer token.</summary>
    private static string? Token(HttpContext ctx)
    {
        var auth = ctx.Request.Headers.Authorization.ToString();
        return auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? auth[7..].Trim() : null;
    }
}
