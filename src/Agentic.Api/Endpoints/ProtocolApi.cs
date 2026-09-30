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

        // Free text in, Business Intent fields out (the sender reviews them before submitting). Needs the model.
        v1.MapPost("/intents/parse", async (HttpContext ctx, IAgentModel ai, Catalog catalog) =>
        {
            if (!ai.Enabled) return Error(501, "not_available", "Parsing free text needs the language model, which this server doesn't have. Fill in the fields instead.");
            if (!ctx.Request.HasJsonContentType()) return Error(415, "unsupported_media_type", "Send the text as application/json.");
            ParseRequest? req;
            try { req = await JsonSerializer.DeserializeAsync<ParseRequest>(ctx.Request.Body, Json.Protocol); }
            catch (JsonException) { return Error(400, "invalid_json", "The body is not valid JSON."); }
            var text = (req?.Text ?? "").Trim();
            if (text.Length < 20) return Error(400, "invalid_request", "Write at least a sentence or two.");
            if (text.Length > 8000) return Error(400, "invalid_request", "Keep the message under 8,000 characters.");
            if (PolicyEngine.DetectInjection(text) is { } inj) return Error(422, "rejected", "The message contains instructions aimed at the recipient's agent (“" + inj + "”). Remove them and try again.");
            var parsed = await ai.Parse(text, MemberId(ctx.User), ctx.RequestAborted);
            if (parsed is null) return Error(503, "unavailable", "The agent couldn't read that message right now. Fill in the fields instead.");
            return Results.Json(Sanitize(parsed, catalog, text), Json.Protocol);
        }).RequireRateLimiting("parse");

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

    /// <summary>Only values the protocol knows; the model's output is treated like any other untrusted input.</summary>
    public static object Sanitize(ParsedIntent p, Catalog catalog, string text) => new
    {
        business_intent_version = catalog.ProtocolVersion,
        intent = new SubmissionIntent
        {
            Category = catalog.Categories.ContainsKey(p.Category) ? p.Category : "other",
            Objective = p.Objective,
            ValueProposition = p.ValueProposition,
            RequestedAction = Catalog.Actions.Contains(p.RequestedAction) ? p.RequestedAction : "reply",
            Topics = p.Topics.Where(catalog.Topics.Contains).Distinct().Take(8).ToList(),
            Stage = p.Stage is not null && catalog.Stages.Contains(p.Stage) ? p.Stage : null,
            RoundSizeUsd = p.RoundSizeUsd is > 0 and < 1e12 ? p.RoundSizeUsd : null,
            Geo = p.Geo is not null && catalog.Geos.Contains(p.Geo) ? p.Geo : null,
            Urgency = Catalog.Urgencies.Contains(p.Urgency) ? p.Urgency : "normal",
        },
        fit_evidence = p.FitEvidence.Where(e => catalog.Evidence.ContainsKey(e.Type) && e.Value.Length > 0).Take(6)
            .Select(e => new SubmissionEvidence { Type = e.Type, Value = e.Value }).ToList(),
        message = text,
    };

    private static string? MemberId(ClaimsPrincipal user) => user.Identity?.IsAuthenticated == true ? user.FindFirstValue(ClaimTypes.NameIdentifier) : null;

    /// <summary>The sender token comes back from POST /v1/intents; send it as a bearer token.</summary>
    private static string? Token(HttpContext ctx)
    {
        var auth = ctx.Request.Headers.Authorization.ToString();
        return auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? auth[7..].Trim() : null;
    }
}
