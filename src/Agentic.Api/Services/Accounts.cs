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
/// <summary>An identity confirmed by an external provider (Google), not yet or already tied to a member.</summary>
public sealed record ExternalIdentity(string Provider, string Subject, string Email, bool EmailVerified, string Name);
public sealed record ExternalSignupRequest(string? Name, string? Headline, string? Location, string? Template, List<string>? Topics);
public sealed record ProfileUpdate(string? Name, string? Headline, string? Location, string? About, List<string>? Topics,
    List<ExperienceItem>? Experience = null, List<EducationItem>? Education = null, List<string>? Skills = null,
    List<OfferItem>? Offers = null, List<OfferItem>? Needs = null, string? Website = null);
/// <summary>Something a member offers, or something they are looking for.</summary>
public sealed record OfferItem(string? Title, string? Description);
public sealed record ExperienceItem(string? Title, string? Company, string? Type, string? Start, string? End, string? Location, string? Description);
public sealed record EducationItem(string? School, string? Degree, string? Start, string? End);

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
        return await Create(name, email, headline, req.Location, req.Template, req.Topics, m => m.PasswordHash = HashPassword(req.Password!));
    }

    /// <summary>Sign-up after Google confirmed who you are: no password, the email comes from Google.</summary>
    public Task<(Member? member, int status, string? error)> SignUpExternal(ExternalIdentity ext, ExternalSignupRequest req)
    {
        var name = (req.Name ?? ext.Name).Trim();
        if (name.Length is < 2 or > 80) return Task.FromResult<(Member?, int, string?)>((null, 400, "Enter your name (2 to 80 characters)."));
        return Create(name, NormalizeEmail(ext.Email), (req.Headline ?? "").Trim(), req.Location, req.Template, req.Topics, m =>
        {
            m.GoogleSubject = ext.Subject;
            if (ext.EmailVerified) MarkEmailVerified(m);
        });
    }

    /// <summary>The member behind a Google sign-in: known by Google id, or an existing account with the same
    /// verified address, which is then linked. Null when this person has no account yet.</summary>
    public async Task<(Member? member, string? error)> FindExternal(ExternalIdentity ext)
    {
        var m = await Db.Members.FirstOrDefaultAsync(x => x.GoogleSubject == ext.Subject);
        if (m is not null) return (m, null);
        var email = NormalizeEmail(ext.Email);
        m = await Db.Members.FirstOrDefaultAsync(x => x.Email == email);
        if (m is null) return (null, null);
        if (!ext.EmailVerified) return (null, "An account with this email already exists. Sign in with your password.");
        if (m.GoogleSubject is not null) return (null, "This email belongs to an account linked to a different Google account.");
        m.GoogleSubject = ext.Subject;
        MarkEmailVerified(m);
        await Db.SaveChangesAsync();
        return (m, null);
    }

    private async Task<(Member? member, int status, string? error)> Create(string name, string email, string headline, string? location, string? templateKey, List<string>? topicList, Action<Member> credentials)
    {
        if (!LooksLikeEmail(email)) return (null, 400, "Enter a valid email address.");
        if (headline.Length is < 2 or > 160) return (null, 400, "Add a headline, for example “Founder at Acme · Developer tools”.");
        if ((location ?? "").Length > 80) return (null, 400, "The location is too long.");
        var template = templateKey is not null && core.Catalog.Templates.ContainsKey(templateKey) ? templateKey : "founder";
        var topics = (topicList ?? []).Where(t => core.Catalog.Topics.Contains(t)).Distinct().Take(12).ToList();
        if (await Db.Members.AnyAsync(m => m.Email == email)) return (null, 409, "An account with this email already exists. Sign in instead.");

        var id = await UniqueId(Slug(name));
        var address = await UniqueAddress(id.Replace('-', '.') + "@" + core.Catalog.AddressNamespace);
        var colors = Palette[(int)((uint)id.GetHashCode(StringComparison.Ordinal) % Palette.Length)];
        var profile = new JsonObject
        {
            ["name"] = name,
            ["headline"] = headline,
            ["loc"] = NullIfEmpty((location ?? "").Trim()),
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
            Template = template,
            Reputation = 50,
            Verified = [],
            ProfileJson = profile.ToJsonString(),
            CreatedAt = DateTime.UtcNow,
        };
        RotateStamp(m);
        m.DigestToken = AgentCore.NewToken();
        credentials(m);
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
        if (req.About is not null) { if (req.About.Length > 2600) return (false, "Keep the about text under 2,600 characters."); p["about"] = NullIfEmpty(req.About.Trim()); }
        if (req.Topics is not null)
            p["topics"] = new JsonArray(req.Topics.Where(t => core.Catalog.Topics.Contains(t)).Distinct().Take(12).Select(t => (JsonNode)t).ToArray());
        if (req.Experience is not null)
        {
            if (req.Experience.Count > 30) return (false, "Keep it to 30 positions.");
            var list = new JsonArray();
            foreach (var e in req.Experience)
            {
                var title = Clean(e.Title, 120); var company = Clean(e.Company, 120);
                if (title is null && company is null) continue;
                if (title is null) return (false, "Every position needs a title.");
                list.Add(new JsonObject
                {
                    ["title"] = title, ["company"] = company, ["type"] = Clean(e.Type, 40), ["start"] = Clean(e.Start, 20),
                    ["end"] = Clean(e.End, 20), ["loc"] = Clean(e.Location, 80), ["desc"] = Clean(e.Description, 2000),
                });
            }
            p["exp"] = list;
        }
        if (req.Education is not null)
        {
            if (req.Education.Count > 15) return (false, "Keep it to 15 schools.");
            var list = new JsonArray();
            foreach (var e in req.Education)
            {
                var school = Clean(e.School, 150);
                if (school is null) { if (Clean(e.Degree, 150) is null) continue; return (false, "Every education entry needs a school."); }
                list.Add(new JsonObject { ["school"] = school, ["deg"] = Clean(e.Degree, 150), ["start"] = Clean(e.Start, 20), ["end"] = Clean(e.End, 20) });
            }
            p["edu"] = list;
        }
        if (req.Offers is not null) { var (list, err) = Items(req.Offers, "offer"); if (err is not null) return (false, err); p["offers"] = list; }
        if (req.Needs is not null) { var (list, err) = Items(req.Needs, "need"); if (err is not null) return (false, err); p["needs"] = list; }
        if (req.Website is not null)
        {
            var site = req.Website.Trim();
            if (site.Length == 0) p.Remove("website");
            else
            {
                if (!site.Contains("://")) site = "https://" + site;
                if (site.Length > 200 || !Uri.TryCreate(site, UriKind.Absolute, out var u) || (u.Scheme != "https" && u.Scheme != "http") || !u.Host.Contains('.'))
                    return (false, "Enter a website like example.com.");
                p["website"] = u.ToString();
            }
        }
        if (req.Skills is not null)
        {
            var skills = req.Skills.Select(s => Clean(s, 60)).OfType<string>().DistinctBy(s => s.ToLowerInvariant()).ToList();
            if (skills.Count > 60) return (false, "Keep it to 60 skills.");
            p["skills"] = new JsonArray(skills.Select(s => (JsonNode)s).ToArray());
        }
        m.ProfileJson = p.ToJsonString();
        await Db.SaveChangesAsync();
        return (true, null);
    }

    // ---------- verification and sessions ----------

    /// <summary>Consumer mail providers: a confirmed address there proves the person, not an employer.</summary>
    private static readonly HashSet<string> FreeMail = new(StringComparer.OrdinalIgnoreCase)
    {
        "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "ymail.com", "icloud.com", "me.com",
        "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.net", "gmx.de", "web.de", "mail.com", "yandex.com",
        "yandex.ru", "zoho.com", "fastmail.com", "hey.com", "tutanota.com", "qq.com", "163.com",
    };

    public static bool IsFreeMail(string email) => FreeMail.Contains(email[(email.LastIndexOf('@') + 1)..]);

    /// <summary>A confirmed address; a company address also earns the "work email" claim senders are scored on.</summary>
    public static void MarkEmailVerified(Member m)
    {
        m.EmailVerified = true;
        if (m.Email is not null && !IsFreeMail(m.Email) && !m.Verified.Contains("work_email"))
            m.Verified = [.. m.Verified, "work_email"];
    }

    public static void RotateStamp(Member m) => m.SecurityStamp = AgentCore.NewToken();

    public async Task<(bool ok, string? error)> ChangePassword(Member m, string? current, string? password)
    {
        if (m.PasswordHash is not null && !VerifyPassword(current ?? "", m.PasswordHash)) return (false, "Your current password isn't right.");
        if ((password ?? "").Length < 10) return (false, "Use a password of at least 10 characters.");
        if (password!.Length > 200) return (false, "That password is too long.");
        m.PasswordHash = HashPassword(password);
        RotateStamp(m);
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

    private static (JsonArray list, string? error) Items(List<OfferItem> items, string what)
    {
        if (items.Count > 15) return ([], "Keep it to 15 items.");
        var list = new JsonArray();
        foreach (var i in items)
        {
            var title = Clean(i.Title, 100); var desc = Clean(i.Description, 500);
            if (title is null && desc is null) continue;
            if (title is null) return ([], "Every " + what + " needs a short title.");
            list.Add(new JsonObject { ["title"] = title, ["desc"] = desc });
        }
        return (list, null);
    }

    private static string? Clean(string? s, int max)
    {
        s = (s ?? "").Trim();
        if (s.Length == 0) return null;
        return s.Length > max ? s[..max].TrimEnd() : s;
    }

    private static string? NullIfEmpty(string s) => s.Length == 0 ? null : s;
}
