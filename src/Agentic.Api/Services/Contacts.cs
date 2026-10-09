using System.IO.Compression;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using Agentic.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Agentic.Api.Services;

public sealed record ImportResult(int Rows, int Added, int Updated, int WithEmail, int OnNetwork);
public sealed record InviteRequest(List<int>? Ids, bool All, string? Note);
public sealed record InviteResult(int Queued, int NoEmail, int AlreadyInvited, int OnNetwork, int OptedOut, int OverDailyLimit, int DailyLimit);

/// <summary>Imports a member's LinkedIn connections and invites them to the network.</summary>
public sealed class Contacts(AgentCore core, EmailOptions email, IConfiguration config)
{
    private AgenticDb Db => core.Db;
    public const int MaxRows = 30_000;
    public const int MaxNote = 600;
    private int PerDay => config.GetValue("Invites:PerDay", 200);
    /// <summary>A contact gets at most one invitation and one reminder, at least a week apart.</summary>
    private static readonly TimeSpan ReminderAfter = TimeSpan.FromDays(7);

    // ---------- import ----------

    /// <summary>Accepts the whole LinkedIn data archive (.zip) or just its Connections.csv.</summary>
    public static (string? csv, string? error) ReadUpload(byte[] data)
    {
        if (data.Length == 0) return (null, "The file is empty.");
        if (data.Length > 4 && data[0] == 'P' && data[1] == 'K')
        {
            try
            {
                using var zip = new ZipArchive(new MemoryStream(data), ZipArchiveMode.Read);
                var entry = zip.Entries.FirstOrDefault(e => e.Name.Equals("Connections.csv", StringComparison.OrdinalIgnoreCase));
                if (entry is null) return (null, "This archive has no Connections.csv. In LinkedIn’s data export choose “Connections”, or upload the CSV itself.");
                if (entry.Length > 20_000_000) return (null, "Connections.csv is too large.");
                using var reader = new StreamReader(entry.Open(), Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
                return (reader.ReadToEnd(), null);
            }
            catch (InvalidDataException) { return (null, "That zip file can’t be read."); }
        }
        using var text = new StreamReader(new MemoryStream(data), Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
        return (text.ReadToEnd(), null);
    }

    public sealed record Row(string First, string Last, string? Email, string? Company, string? Position, string? Url, string? ConnectedOn);

    /// <summary>LinkedIn's Connections.csv: a few "Notes:" lines, then
    /// <c>First Name,Last Name,URL,Email Address,Company,Position,Connected On</c>.</summary>
    public static (List<Row> rows, string? error) ParseLinkedIn(string csv)
    {
        var records = Csv(csv);
        var headerAt = records.FindIndex(r => r.Any(c => c.Trim().Equals("First Name", StringComparison.OrdinalIgnoreCase)) && r.Any(c => c.Trim().Equals("Last Name", StringComparison.OrdinalIgnoreCase)));
        if (headerAt < 0) return ([], "This doesn’t look like LinkedIn’s Connections.csv (no “First Name, Last Name” header).");
        var header = records[headerAt].Select(h => h.Trim().ToLowerInvariant()).ToList();
        int Col(params string[] names) => names.Select(n => header.IndexOf(n)).FirstOrDefault(i => i >= 0, -1);
        int first = Col("first name"), last = Col("last name"), url = Col("url", "profile url"), mail = Col("email address", "email"),
            company = Col("company"), position = Col("position"), connected = Col("connected on");
        string? Get(List<string> r, int i) => i >= 0 && i < r.Count && r[i].Trim().Length > 0 ? r[i].Trim() : null;

        var rows = new List<Row>();
        foreach (var r in records.Skip(headerAt + 1))
        {
            var f = Get(r, first) ?? ""; var l = Get(r, last) ?? "";
            if (f.Length == 0 && l.Length == 0) continue;
            var e = Get(r, mail);
            if (e is not null && !Accounts.LooksLikeEmail(Accounts.NormalizeEmail(e))) e = null;
            rows.Add(new Row(Cut(f, 80)!, Cut(l, 80)!, e is null ? null : Accounts.NormalizeEmail(e), Cut(Get(r, company), 120), Cut(Get(r, position), 160), NormalizeUrl(Get(r, url)), Cut(Get(r, connected), 40)));
            if (rows.Count > MaxRows) return ([], "That file has more than " + MaxRows.ToString("N0") + " connections.");
        }
        if (rows.Count == 0) return ([], "No connections found in that file.");
        return (rows, null);
    }

    public async Task<(ImportResult? result, string? error)> Import(string ownerId, byte[] data)
    {
        var (csv, readError) = ReadUpload(data);
        if (csv is null) return (null, readError);
        var (rows, parseError) = ParseLinkedIn(csv);
        if (parseError is not null) return (null, parseError);

        // Your own address can be in the export (for example a second account); never import yourself.
        var ownEmail = (await Db.Members.FindAsync(ownerId))?.Email;
        if (ownEmail is not null) rows = rows.Where(r => r.Email != ownEmail).ToList();
        var existing = await Db.Contacts.Where(c => c.OwnerId == ownerId).ToListAsync();
        var byKey = new Dictionary<string, Contact>();
        foreach (var c in existing) byKey.TryAdd(Key(c.LinkedInUrl, c.Email, c.FirstName, c.LastName, c.Company), c);

        int added = 0, updated = 0;
        var now = DateTime.UtcNow;
        foreach (var r in rows)
        {
            var key = Key(r.Url, r.Email, r.First, r.Last, r.Company);
            if (byKey.TryGetValue(key, out var c))
            {
                c.FirstName = r.First; c.LastName = r.Last; c.Company = r.Company; c.Position = r.Position; c.ConnectedOn = r.ConnectedOn;
                c.Email = r.Email ?? c.Email;
                updated++;
                continue;
            }
            c = new Contact { OwnerId = ownerId, FirstName = r.First, LastName = r.Last, Email = r.Email, Company = r.Company, Position = r.Position, LinkedInUrl = r.Url, ConnectedOn = r.ConnectedOn, ImportedAt = now };
            Db.Contacts.Add(c);
            byKey[key] = c;
            added++;
        }
        await Db.SaveChangesAsync();
        await MarkMembers(ownerId);
        var mine = Db.Contacts.Where(c => c.OwnerId == ownerId);
        return (new ImportResult(rows.Count, added, updated, await mine.CountAsync(c => c.Email != null), await mine.CountAsync(c => c.Status == "member" || c.Status == "joined")), null);
    }

    /// <summary>Contacts whose email already belongs to a member are not invited again.</summary>
    private async Task MarkMembers(string ownerId)
    {
        var emails = await Db.Contacts.Where(c => c.OwnerId == ownerId && c.Email != null && (c.Status == "new" || c.Status == "invited")).Select(c => c.Email!).ToListAsync();
        if (emails.Count == 0) return;
        var members = await Db.Members.Where(m => m.Email != null && emails.Contains(m.Email)).ToDictionaryAsync(m => m.Email!, m => m.Id);
        if (members.Count == 0) return;
        foreach (var c in await Db.Contacts.Where(c => c.OwnerId == ownerId && c.Email != null && members.Keys.Contains(c.Email)).ToListAsync())
        {
            if (c.Status is "new" or "invited") { c.Status = "member"; c.JoinedMemberId = members[c.Email!]; }
        }
        await Db.SaveChangesAsync();
    }

    // ---------- list ----------

    public async Task<object> List(string ownerId, bool emailDelivers)
    {
        await MarkMembers(ownerId);
        var list = await Db.Contacts.AsNoTracking().Where(c => c.OwnerId == ownerId).OrderBy(c => c.FirstName).ThenBy(c => c.LastName).ToListAsync();
        var sentToday = await SentToday(ownerId);
        var now = DateTime.UtcNow;
        return new
        {
            emailDelivers,
            dailyLimit = PerDay,
            remainingToday = Math.Max(0, PerDay - sentToday),
            summary = new
            {
                total = list.Count,
                withEmail = list.Count(c => c.Email is not null),
                invited = list.Count(c => c.Status == "invited"),
                joined = list.Count(c => c.Status == "joined"),
                onNetwork = list.Count(c => c.Status == "member"),
                optedOut = list.Count(c => c.Status == "opted_out"),
                invitable = list.Count(c => Invitable(c, now)),
            },
            contacts = list.Select(c => new
            {
                id = c.Id,
                first = c.FirstName,
                last = c.LastName,
                email = c.Email,
                company = c.Company,
                position = c.Position,
                url = c.LinkedInUrl,
                connectedOn = c.ConnectedOn,
                status = c.Status,
                invitedAt = c.InvitedAt,
                canRemind = c.Status == "invited" && Invitable(c, now),
                memberId = c.JoinedMemberId,
            }),
        };
    }

    private static bool Invitable(Contact c, DateTime now) =>
        c.Email is not null && (c.Status == "new" || (c.Status == "invited" && c.InviteCount < 2 && c.InvitedAt < now - ReminderAfter));

    private Task<int> SentToday(string ownerId)
    {
        var since = DateTime.UtcNow.AddHours(-24);
        return Db.Outbox.CountAsync(m => m.OwnerId == ownerId && m.Kind == "invite" && m.CreatedAt > since);
    }

    /// <summary>The owner's own contacts matching a name, company, position or email (for the global search box).</summary>
    public async Task<List<object>> Search(string ownerId, string? query, int take = 5)
    {
        var q = (query ?? "").Trim().ToLowerInvariant();
        if (q.Length < 2) return [];
        var hits = await Db.Contacts.AsNoTracking()
            .Where(c => c.OwnerId == ownerId && (
                (c.FirstName + " " + c.LastName).ToLower().Contains(q) ||
                (c.Company ?? "").ToLower().Contains(q) ||
                (c.Position ?? "").ToLower().Contains(q) ||
                (c.Email ?? "").Contains(q)))
            // People who are already here first, then those you can email, then the rest.
            .OrderByDescending(c => c.Status == "joined" || c.Status == "member")
            .ThenByDescending(c => c.Email != null)
            .ThenBy(c => c.FirstName).ThenBy(c => c.LastName)
            .Take(Math.Clamp(take, 1, 10))
            .ToListAsync();
        return hits.Select(c => (object)new
        {
            id = c.Id, first = c.FirstName, last = c.LastName, company = c.Company, position = c.Position,
            hasEmail = c.Email is not null, url = c.LinkedInUrl, status = c.Status, memberId = c.JoinedMemberId,
        }).ToList();
    }

    // ---------- invite ----------

    public async Task<(InviteResult? result, string? error)> Invite(string ownerId, InviteRequest req, string baseUrl)
    {
        var note = (req.Note ?? "").Trim();
        if (note.Length > MaxNote) return (null, "Keep the personal note under " + MaxNote + " characters.");
        if (!req.All && (req.Ids is null || req.Ids.Count == 0)) return (null, "Choose who to invite.");
        var owner = await Db.Members.FindAsync(ownerId) ?? throw new InvalidOperationException("Unknown member");

        await MarkMembers(ownerId);
        var q = Db.Contacts.Where(c => c.OwnerId == ownerId);
        if (!req.All) { var ids = req.Ids!.Distinct().ToList(); q = q.Where(c => ids.Contains(c.Id)); }
        var chosen = await q.OrderBy(c => c.Id).ToListAsync();

        var hashes = chosen.Where(c => c.Email is not null).Select(c => EmailHash(c.Email!)).Distinct().ToList();
        var optedOut = (await Db.OptOuts.Where(o => hashes.Contains(o.EmailHash)).Select(o => o.EmailHash).ToListAsync()).ToHashSet();

        var remaining = Math.Max(0, PerDay - await SentToday(ownerId));
        int queued = 0, noEmail = 0, already = 0, onNetwork = 0, opted = 0, over = 0;
        var now = DateTime.UtcNow;
        foreach (var c in chosen)
        {
            if (c.Status is "member" or "joined") { onNetwork++; continue; }
            if (c.Status == "opted_out" || (c.Email is not null && optedOut.Contains(EmailHash(c.Email)))) { c.Status = "opted_out"; opted++; continue; }
            if (c.Email is null) { noEmail++; continue; }
            if (!Invitable(c, now)) { already++; continue; }
            if (queued >= remaining) { over++; continue; }

            c.InviteCode ??= NewCode();
            c.Status = "invited";
            c.InvitedAt = now;
            c.InviteCount++;
            Db.Outbox.Add(InviteMail(owner, c, note, baseUrl, reminder: c.InviteCount > 1));
            queued++;
        }
        await Db.SaveChangesAsync();
        return (new InviteResult(queued, noEmail, already, onNetwork, opted, over, PerDay), null);
    }

    /// <summary>A personal invite link to share by hand (for example in a LinkedIn message).</summary>
    public async Task<object?> Link(string ownerId, int id, string baseUrl)
    {
        var c = await Db.Contacts.FirstOrDefaultAsync(x => x.OwnerId == ownerId && x.Id == id);
        if (c is null) return null;
        if (c.Status is "member" or "joined") return new { url = (string?)null, message = (string?)null, status = c.Status };
        c.InviteCode ??= NewCode();
        await Db.SaveChangesAsync();
        var owner = await Db.Members.FindAsync(ownerId);
        var url = InviteUrl(baseUrl, c.InviteCode);
        var message = "Hi " + c.FirstName + ", I’ve moved my inbound business requests to " + core.Catalog.BrandName +
            ": an AI agent I control screens them, so the relevant ones get my full attention. Setting up your own agent takes two minutes, and this link connects us there: " + url;
        return new { url, message, status = c.Status };
    }

    public async Task<int> DeleteAll(string ownerId)
    {
        var pending = await Db.Outbox.Where(m => m.OwnerId == ownerId && m.Kind == "invite" && m.Status == "pending").ToListAsync();
        Db.Outbox.RemoveRange(pending);
        var all = await Db.Contacts.Where(c => c.OwnerId == ownerId).ToListAsync();
        Db.Contacts.RemoveRange(all);
        await Db.SaveChangesAsync();
        return all.Count;
    }

    // ---------- the invited person's side ----------

    public async Task<(Contact contact, Member inviter)?> FindInvite(string? code)
    {
        if (string.IsNullOrWhiteSpace(code) || code.Length > 64) return null;
        var c = await Db.Contacts.FirstOrDefaultAsync(x => x.InviteCode == code);
        if (c is null || c.Status is "joined" or "opted_out") return null;
        var inviter = await Db.Members.FindAsync(c.OwnerId);
        return inviter is null ? null : (c, inviter);
    }

    public async Task<bool> OptOut(string? code)
    {
        if (string.IsNullOrWhiteSpace(code) || code.Length > 64) return false;
        var c = await Db.Contacts.FirstOrDefaultAsync(x => x.InviteCode == code);
        if (c is null) return false;
        c.Status = "opted_out";
        if (c.Email is not null)
        {
            var hash = EmailHash(c.Email);
            if (!await Db.OptOuts.AnyAsync(o => o.EmailHash == hash)) Db.OptOuts.Add(new EmailOptOut { EmailHash = hash, CreatedAt = DateTime.UtcNow });
            // Nobody else's import can invite this address again, and anything still queued is cancelled.
            foreach (var other in await Db.Contacts.Where(x => x.Email == c.Email && (x.Status == "new" || x.Status == "invited")).ToListAsync()) other.Status = "opted_out";
            Db.Outbox.RemoveRange(await Db.Outbox.Where(m => m.To == c.Email && m.Kind == "invite" && m.Status == "pending").ToListAsync());
        }
        await Db.SaveChangesAsync();
        return true;
    }

    /// <summary>After sign-up through an invite: the code is used up and both agents know each other.</summary>
    public async Task Accept(Contact c, Member joined)
    {
        c.Status = "joined";
        c.JoinedMemberId = joined.Id;
        c.InviteCode = null;
        foreach (var (a, b) in new[] { (joined.Id, c.OwnerId), (c.OwnerId, joined.Id) })
            if (!await Db.Relationships.AnyAsync(r => r.MemberId == a && r.OtherId == b))
                Db.Relationships.Add(new Relationship { MemberId = a, OtherId = b, Degree = "1st", Prior = 1, Mutuals = 0 });
        // Others who imported the same person see them as already on the network.
        if (joined.Email is not null)
            foreach (var other in await Db.Contacts.Where(x => x.Id != c.Id && x.Email == joined.Email && (x.Status == "new" || x.Status == "invited")).ToListAsync())
            { other.Status = "member"; other.JoinedMemberId = joined.Id; }
        await Db.SaveChangesAsync();
    }

    // ---------- the email ----------

    private OutboundEmail InviteMail(Member owner, Contact c, string note, string baseUrl, bool reminder)
    {
        var brand = core.Catalog.BrandName;
        note = note.Replace("{first}", c.FirstName, StringComparison.OrdinalIgnoreCase);
        var url = InviteUrl(baseUrl, c.InviteCode!);
        var optOut = baseUrl.TrimEnd('/') + "/#optout." + c.InviteCode;
        var ownerFirst = owner.Name.Split(' ')[0];
        var subject = reminder ? "Reminder: " + owner.Name + " invited you to " + brand : owner.Name + " invited you to " + brand;
        var pitch = owner.Name + " (" + owner.Headline + ") uses " + brand + ", a professional network where an AI agent you control screens business requests. The relevant ones reach you with a short brief; the rest get a polite answer.";
        var why = "You’re connected with " + ownerFirst + " on LinkedIn, which is why you got this invitation. You’ll get at most one reminder.";

        var text = new StringBuilder()
            .Append("Hi ").Append(c.FirstName).Append(",\n\n")
            .Append(note.Length > 0 ? note + "\n— " + ownerFirst + "\n\n" : "")
            .Append(pitch).Append("\n\n")
            .Append("Set up your agent (about two minutes): ").Append(url).Append("\n\n")
            .Append(why).Append('\n')
            .Append("Don’t want invitations to this address? ").Append(optOut).Append('\n')
            .ToString();

        string H(string s) => WebUtility.HtmlEncode(s);
        var html = "<!doctype html><html><body style=\"margin:0;background:#f4f6f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#15201c\">" +
            "<div style=\"max-width:520px;margin:0 auto;padding:32px 20px\"><div style=\"background:#fff;border:1px solid #dfe5e2;border-radius:12px;padding:28px\">" +
            "<p style=\"margin:0 0 16px;font-size:16px\">Hi " + H(c.FirstName) + ",</p>" +
            (note.Length > 0 ? "<p style=\"margin:0 0 16px;font-size:16px;white-space:pre-line;border-left:3px solid #0d7a69;padding-left:12px\">" + H(note) + "<br>— " + H(ownerFirst) + "</p>" : "") +
            "<p style=\"margin:0 0 20px;font-size:15px;line-height:1.5;color:#3b4a44\">" + H(pitch) + "</p>" +
            "<p style=\"margin:0 0 24px\"><a href=\"" + H(url) + "\" style=\"display:inline-block;background:#0d7a69;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px\">Set up your agent</a></p>" +
            "<p style=\"margin:0;font-size:13px;line-height:1.5;color:#65746e\">" + H(why) + "<br><a href=\"" + H(optOut) + "\" style=\"color:#65746e\">Don’t send me invitations</a></p>" +
            "</div></div></body></html>";

        return new OutboundEmail
        {
            Kind = "invite", OwnerId = owner.Id, ContactId = c.Id, To = c.Email!, ReplyTo = owner.Email,
            FromName = owner.Name + " via " + (email.FromName.Length > 0 ? email.FromName : brand),
            Subject = subject, Text = text, Html = html, UnsubscribeUrl = optOut, CreatedAt = DateTime.UtcNow,
        };
    }

    // ---------- helpers ----------

    public static string InviteUrl(string baseUrl, string code) => baseUrl.TrimEnd('/') + "/#invite." + code;

    private static string NewCode() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(16)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static string EmailHash(string email) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Accounts.NormalizeEmail(email))));

    private static string Key(string? url, string? email, string first, string last, string? company) =>
        url is not null ? "u:" + url : email is not null ? "e:" + email : "n:" + (first + " " + last + " " + company).ToLowerInvariant();

    private static string? NormalizeUrl(string? url)
    {
        if (url is null || !Uri.TryCreate(url, UriKind.Absolute, out var u) || (u.Scheme != "https" && u.Scheme != "http")) return null;
        if (!u.Host.EndsWith("linkedin.com", StringComparison.OrdinalIgnoreCase)) return null;
        return ("https://www.linkedin.com" + u.AbsolutePath.TrimEnd('/')).ToLowerInvariant();
    }

    private static string? Cut(string? s, int max) => s is null ? null : s.Length > max ? s[..max] : s;

    /// <summary>RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes.</summary>
    public static List<List<string>> Csv(string text)
    {
        var rows = new List<List<string>>();
        var row = new List<string>();
        var field = new StringBuilder();
        var quoted = false;
        for (var i = 0; i < text.Length; i++)
        {
            var ch = text[i];
            if (quoted)
            {
                if (ch == '"')
                {
                    if (i + 1 < text.Length && text[i + 1] == '"') { field.Append('"'); i++; }
                    else quoted = false;
                }
                else field.Append(ch);
                continue;
            }
            switch (ch)
            {
                case '"' when field.Length == 0: quoted = true; break;
                case ',': row.Add(field.ToString()); field.Clear(); break;
                case '\r': break;
                case '\n': row.Add(field.ToString()); field.Clear(); rows.Add(row); row = []; break;
                default: field.Append(ch); break;
            }
        }
        if (field.Length > 0 || row.Count > 0) { row.Add(field.ToString()); rows.Add(row); }
        return rows;
    }
}
