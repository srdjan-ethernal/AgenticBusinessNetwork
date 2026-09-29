using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Agentic.Api.Data;
using Agentic.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Agentic.Api.Services;

public sealed record SignupRequest(string? Name, string? Email, string? Password, string? Headline, string? Location, string? Template, List<string>? Topics);
public sealed record LoginRequest(string? Email, string? Password);
public sealed record ProfileUpdate(string? Name, string? Headline, string? Location, string? About, List<string>? Topics);

/// <summary>Real accounts: email + password (PBKDF2), a member, an agent address and a policy from a template.</summary>
public sealed partial class Accounts(AgentCore core)
{
    private AgenticDb Db => core.Db;

    private static readonly string[][] Palette =
    [
        ["#0f766e", "#5eead4"], ["#b2476b", "#e8956f"], ["#4338ca", "#a5b4fc"], ["#c2410c", "#f59e0b"], ["#15803d", "#86efac"],
        ["#7a4bd1", "#b089f5"], ["#0e7490", "#67e8f9"], ["#9f1239", "#fb7185"], ["#1e40af", "#60a5fa"], ["#a16207", "#facc15"],
    ];

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    private static partial Regex EmailRegex();

    public static string NormalizeEmail(string? email) => (email ?? "").Trim().ToLowerInvariant();
    public static bool LooksLikeEmail(string email) => email.Length <= 200 && EmailRegex().IsMatch(email);

    public async Task<(Member? member, int status, string? error)> SignUp(SignupRequest req)
    {
        var name = (req.Name ?? "").Trim();
        var email = NormalizeEmail(req.Email);
        var headline = (req.Headline ?? "").Trim();
        if (name.Length is < 2 or > 80) return (null, 400, "Enter your name (2 to 80 characters).");
        if (!LooksLikeEmail(email)) return (null, 400, "Enter a valid email address.");
        if ((req.Password ?? "").Length < 10) return (null, 400, "Use a password of at least 10 characters.");
        if ((req.Password ?? "").Length > 200) return (null, 400, "That password is too long.");
        if (headline.Length is < 2 or > 160) return (null, 400, "Add a headline, for example “Founder at Acme · Developer tools”.");
        var template = req.Template is not null && core.Catalog.Templates.ContainsKey(req.Template) ? req.Template : "founder";
        var topics = (req.Topics ?? []).Where(t => core.Catalog.Topics.Contains(t)).Distinct().Take(12).ToList();
        if (await Db.Members.AnyAsync(m => m.Email == email)) return (null, 409, "An account with this email already exists. Sign in instead.");

        var id = await UniqueId(Slug(name));
        var address = await UniqueAddress(id.Replace('-', '.') + "@" + core.Catalog.AddressNamespace);
        var colors = Palette[(int)((uint)id.GetHashCode(StringComparison.Ordinal) % Palette.Length)];
        var profile = new JsonObject
        {
            ["name"] = name,
            ["headline"] = headline,
            ["loc"] = NullIfEmpty((req.Location ?? "").Trim()),
            ["c"] = new JsonArray(colors[0], colors[1]),
            ["topics"] = new JsonArray(topics.Select(t => (JsonNode)t).ToArray()),
            ["connections"] = "0",
            ["followers"] = 0,
        };
        var m = new Member
        {
            Id = id,
            Name = name,
            Headline = headline,
            AgentAddress = address,
            Email = email,
            PasswordHash = HashPassword(req.Password!),
            Template = template,
            Reputation = 50,
            Verified = [],
            ProfileJson = profile.ToJsonString(),
            CreatedAt = DateTime.UtcNow,
        };
        Db.Members.Add(m);
        var policy = core.Catalog.PolicyFromTemplate(template, topics);
        // A new agent keeps its template's thesis cap (investors decline off-thesis intents by default).
        policy.ThesisHardFilter = (bool)core.Catalog.Templates[template].Policy["thesisHardFilter"]!;
        var rec = new PolicyRecord { OwnerId = id };
        rec.Write(policy);
        Db.Policies.Add(rec);
        await Db.SaveChangesAsync();
        return (m, 201, null);
    }

    public async Task<Member?> LogIn(LoginRequest req)
    {
        var email = NormalizeEmail(req.Email);
        var m = await Db.Members.FirstOrDefaultAsync(x => x.Email == email);
        // Always hash, so the response time doesn't reveal whether the email exists.
        var ok = VerifyPassword(req.Password ?? "", m?.PasswordHash ?? DummyHash);
        return m is not null && m.PasswordHash is not null && ok ? m : null;
    }

    public async Task<(bool ok, string? error)> UpdateProfile(string memberId, ProfileUpdate req)
    {
        var m = await Db.Members.FindAsync(memberId);
        if (m is null) return (false, "Unknown member.");
        var p = JsonNode.Parse(m.ProfileJson) as JsonObject ?? [];
        if (req.Name is not null)
        {
            var name = req.Name.Trim();
            if (name.Length is < 2 or > 80) return (false, "Enter your name (2 to 80 characters).");
            m.Name = name; p["name"] = name;
        }
        if (req.Headline is not null)
        {
            var headline = req.Headline.Trim();
            if (headline.Length is < 2 or > 160) return (false, "The headline must be 2 to 160 characters.");
            m.Headline = headline; p["headline"] = headline;
        }
        if (req.Location is not null) { if (req.Location.Length > 80) return (false, "The location is too long."); p["loc"] = NullIfEmpty(req.Location.Trim()); }
        if (req.About is not null) { if (req.About.Length > 2000) return (false, "Keep the about text under 2,000 characters."); p["about"] = NullIfEmpty(req.About.Trim()); }
        if (req.Topics is not null)
            p["topics"] = new JsonArray(req.Topics.Where(t => core.Catalog.Topics.Contains(t)).Distinct().Take(12).Select(t => (JsonNode)t).ToArray());
        m.ProfileJson = p.ToJsonString();
        await Db.SaveChangesAsync();
        return (true, null);
    }

    // ---------- passwords (PBKDF2-SHA256, OWASP 2023 iteration count) ----------

    private const int Iterations = 600_000;
    private static readonly string DummyHash = HashPassword("not-a-real-password-" + Guid.NewGuid());

    public static string HashPassword(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, 32);
        return "pbkdf2-sha256$" + Iterations + "$" + Convert.ToBase64String(salt) + "$" + Convert.ToBase64String(hash);
    }

    public static bool VerifyPassword(string password, string stored)
    {
        var parts = stored.Split('$');
        if (parts.Length != 4 || parts[0] != "pbkdf2-sha256" || !int.TryParse(parts[1], out var iterations)) return false;
        var salt = Convert.FromBase64String(parts[2]);
        var expected = Convert.FromBase64String(parts[3]);
        var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }

    // ---------- ids and addresses ----------

    public static string Slug(string name)
    {
        var decomposed = name.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var ch in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark) continue;
            // Serbian/Croatian đ is written "dj" in ASCII (Đorđe → djordje).
            if (ch is 'đ' or 'Đ') { sb.Append("dj"); continue; }
            var c = char.ToLowerInvariant(ch switch { 'ł' or 'Ł' => 'l', 'ø' or 'Ø' => 'o', 'ß' => 's', _ => ch });
            sb.Append(c is >= 'a' and <= 'z' or >= '0' and <= '9' ? c : '-');
        }
        var slug = Regex.Replace(sb.ToString(), "-+", "-").Trim('-');
        if (slug.Length > 40) slug = slug[..40].Trim('-');
        return slug.Length == 0 ? "member" : slug;
    }

    private async Task<string> UniqueId(string baseId)
    {
        var id = baseId;
        for (var n = 2; await Db.Members.AnyAsync(m => m.Id == id); n++) id = baseId + "-" + n;
        return id;
    }

    private async Task<string> UniqueAddress(string baseAddress)
    {
        var address = baseAddress;
        var at = baseAddress.IndexOf('@');
        for (var n = 2; await Db.Members.AnyAsync(m => m.AgentAddress == address); n++) address = baseAddress[..at] + "." + n + baseAddress[at..];
        return address;
    }

    private static string? NullIfEmpty(string s) => s.Length == 0 ? null : s;
}
