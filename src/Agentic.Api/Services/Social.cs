using System.Text.Json.Nodes;
using Agentic.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Agentic.Api.Services;

/// <summary>Connections, posts, the feed, likes, comments and notifications.</summary>
public sealed class Social(AgenticDb db)
{
    public const int MaxPost = 3000, MaxComment = 1250, MaxImage = 2 * 1024 * 1024, PageSize = 20;

    // ---------- connections ----------

    public Task<List<string>> ConnectionIds(string memberId) =>
        db.Relationships.Where(r => r.MemberId == memberId && r.Degree == "1st").Select(r => r.OtherId).ToListAsync();

    /// <summary>Send a request, or accept theirs if they already asked you.</summary>
    public async Task<(string state, string? error)> Connect(string me, string other, string? note)
    {
        if (me == other) return ("", "You can’t connect with yourself.");
        var target = await db.Members.FindAsync(other);
        if (target is null || target.Kind != "person" || target.Email is null) return ("", "You can only connect with people on Knockero.");
        if (await db.Relationships.AnyAsync(r => r.MemberId == me && r.OtherId == other && r.Degree == "1st")) return ("connected", null);
        var theirs = await db.ConnectionRequests.FirstOrDefaultAsync(r => r.FromId == other && r.ToId == me && r.Status == "pending");
        if (theirs is not null) { await Accept(theirs); return ("connected", null); }
        if (await db.ConnectionRequests.AnyAsync(r => r.FromId == me && r.ToId == other && r.Status == "pending")) return ("pending", null);
        var since = DateTime.UtcNow.AddDays(-1);
        if (await db.ConnectionRequests.CountAsync(r => r.FromId == me && r.CreatedAt > since) >= 100) return ("", "You sent 100 requests today. Try again tomorrow.");
        db.ConnectionRequests.Add(new ConnectionRequest { FromId = me, ToId = other, Note = Clip(note, 300), CreatedAt = DateTime.UtcNow });
        Notify(other, "connect", me, null);
        await db.SaveChangesAsync();
        return ("pending", null);
    }

    public async Task<string?> Respond(string me, long requestId, bool accept)
    {
        var req = await db.ConnectionRequests.FirstOrDefaultAsync(r => r.Id == requestId && r.ToId == me && r.Status == "pending");
        if (req is null) return "That request is no longer open.";
        if (accept) await Accept(req);
        else { req.Status = "ignored"; await db.SaveChangesAsync(); }
        return null;
    }

    private async Task Accept(ConnectionRequest req)
    {
        req.Status = "accepted";
        foreach (var (a, b) in new[] { (req.FromId, req.ToId), (req.ToId, req.FromId) })
        {
            var rel = await db.Relationships.FirstOrDefaultAsync(r => r.MemberId == a && r.OtherId == b);
            if (rel is null) db.Relationships.Add(new Relationship { MemberId = a, OtherId = b, Degree = "1st" });
            else rel.Degree = "1st";
        }
        Notify(req.FromId, "accepted", req.ToId, null);
        await db.SaveChangesAsync();
    }

    public async Task Disconnect(string me, string other)
    {
        foreach (var rel in await db.Relationships.Where(r => (r.MemberId == me && r.OtherId == other) || (r.MemberId == other && r.OtherId == me)).ToListAsync())
            rel.Degree = "";
        await db.SaveChangesAsync();
    }

    public async Task<object> Requests(string me)
    {
        var incoming = await db.ConnectionRequests.AsNoTracking().Where(r => r.ToId == me && r.Status == "pending").OrderByDescending(r => r.CreatedAt).Take(100).ToListAsync();
        var outgoing = await db.ConnectionRequests.AsNoTracking().Where(r => r.FromId == me && r.Status == "pending").Select(r => r.ToId).ToListAsync();
        var people = await People(incoming.Select(r => r.FromId));
        return new
        {
            incoming = incoming.Where(r => people.ContainsKey(r.FromId)).Select(r => new { id = r.Id, from = people[r.FromId], note = r.Note, at = r.CreatedAt }),
            outgoing,
        };
    }

    // ---------- posts and the feed ----------

    public async Task<(Post? post, string? error)> CreatePost(string authorId, string? text)
    {
        var t = (text ?? "").Trim();
        if (t.Length == 0) return (null, "Write something first.");
        if (t.Length > MaxPost) return (null, "Keep posts under 3,000 characters.");
        var since = DateTime.UtcNow.AddHours(-1);
        if (await db.Posts.CountAsync(p => p.AuthorId == authorId && p.CreatedAt > since) >= 30) return (null, "That’s a lot of posts in one hour. Try again later.");
        var post = new Post { AuthorId = authorId, Text = t, CreatedAt = DateTime.UtcNow };
        db.Posts.Add(post);
        await db.SaveChangesAsync();
        return (post, null);
    }

    public async Task<string?> SetImage(string authorId, long postId, byte[] bytes, string type)
    {
        var post = await db.Posts.FirstOrDefaultAsync(p => p.Id == postId && p.AuthorId == authorId);
        if (post is null) return "Post not found.";
        post.Image = bytes; post.ImageType = type;
        await db.SaveChangesAsync();
        return null;
    }

    public async Task<bool> DeletePost(string me, long postId)
    {
        var post = await db.Posts.FirstOrDefaultAsync(p => p.Id == postId && p.AuthorId == me);
        if (post is null) return false;
        await db.PostLikes.Where(l => l.PostId == postId).ExecuteDeleteAsync();
        await db.PostComments.Where(c => c.PostId == postId).ExecuteDeleteAsync();
        await db.Notifications.Where(n => n.PostId == postId).ExecuteDeleteAsync();
        db.Posts.Remove(post);
        await db.SaveChangesAsync();
        return true;
    }

    /// <summary>Your posts, your connections’ posts and posts by the companies you work at or manage, newest first.</summary>
    public async Task<List<object>> Feed(string me, long? before)
    {
        var authors = await ConnectionIds(me);
        authors.Add(me);
        var mine = await db.Members.FindAsync(me);
        if (mine?.OrgId is { } org) authors.Add(org);
        authors.AddRange(await db.OrgAdmins.Where(a => a.MemberId == me).Select(a => a.OrgId).ToListAsync());
        authors = authors.Distinct().ToList();
        var q = db.Posts.AsNoTracking().Where(p => authors.Contains(p.AuthorId));
        if (before is long b) q = q.Where(p => p.Id < b);
        return await Shape(me, await q.OrderByDescending(p => p.Id).Take(PageSize).ToListAsync());
    }

    public async Task<List<object>> ByAuthor(string me, string authorId, long? before)
    {
        var q = db.Posts.AsNoTracking().Where(p => p.AuthorId == authorId);
        if (before is long b) q = q.Where(p => p.Id < b);
        return await Shape(me, await q.OrderByDescending(p => p.Id).Take(PageSize).ToListAsync());
    }

    public async Task<object?> One(string me, long postId) =>
        (await Shape(me, await db.Posts.AsNoTracking().Where(p => p.Id == postId).ToListAsync())).FirstOrDefault();

    public async Task<(byte[] bytes, string type)?> Image(long postId)
    {
        var p = await db.Posts.AsNoTracking().Where(x => x.Id == postId).Select(x => new { x.Image, x.ImageType }).FirstOrDefaultAsync();
        return p?.Image is { } img ? (img, p.ImageType ?? "image/jpeg") : null;
    }

    private async Task<List<object>> Shape(string me, List<Post> posts)
    {
        var ids = posts.Select(p => p.Id).ToList();
        var likes = await db.PostLikes.AsNoTracking().Where(l => ids.Contains(l.PostId)).GroupBy(l => l.PostId).Select(g => new { g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.N);
        var liked = (await db.PostLikes.AsNoTracking().Where(l => ids.Contains(l.PostId) && l.MemberId == me).Select(l => l.PostId).ToListAsync()).ToHashSet();
        var comments = await db.PostComments.AsNoTracking().Where(c => ids.Contains(c.PostId)).GroupBy(c => c.PostId).Select(g => new { g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.N);
        var people = await People(posts.Select(p => p.AuthorId));
        return posts.Where(p => people.ContainsKey(p.AuthorId)).Select(p => (object)new
        {
            id = p.Id, author = people[p.AuthorId], text = p.Text, at = p.CreatedAt,
            image = p.ImageType is null ? null : "api/posts/" + p.Id + "/image",
            likes = likes.GetValueOrDefault(p.Id), liked = liked.Contains(p.Id), comments = comments.GetValueOrDefault(p.Id), mine = p.AuthorId == me,
        }).ToList();
    }

    // ---------- likes and comments ----------

    public async Task<(bool liked, int count)?> ToggleLike(string me, long postId)
    {
        var post = await db.Posts.FindAsync(postId);
        if (post is null) return null;
        var like = await db.PostLikes.FindAsync(postId, me);
        if (like is null)
        {
            db.PostLikes.Add(new PostLike { PostId = postId, MemberId = me, At = DateTime.UtcNow });
            if (post.AuthorId != me && !await db.Notifications.AnyAsync(n => n.MemberId == post.AuthorId && n.Kind == "like" && n.ActorId == me && n.PostId == postId))
                Notify(post.AuthorId, "like", me, postId);
        }
        else db.PostLikes.Remove(like);
        await db.SaveChangesAsync();
        return (like is null, await db.PostLikes.CountAsync(l => l.PostId == postId));
    }

    public async Task<List<object>?> Comments(long postId)
    {
        if (!await db.Posts.AnyAsync(p => p.Id == postId)) return null;
        var list = await db.PostComments.AsNoTracking().Where(c => c.PostId == postId).OrderBy(c => c.Id).Take(200).ToListAsync();
        var people = await People(list.Select(c => c.AuthorId));
        return list.Where(c => people.ContainsKey(c.AuthorId)).Select(c => (object)new { id = c.Id, author = people[c.AuthorId], text = c.Text, at = c.CreatedAt }).ToList();
    }

    public async Task<string?> AddComment(string me, long postId, string? text)
    {
        var t = (text ?? "").Trim();
        if (t.Length == 0) return "Write a comment first.";
        if (t.Length > MaxComment) return "Keep comments under 1,250 characters.";
        var post = await db.Posts.FindAsync(postId);
        if (post is null) return "Post not found.";
        db.PostComments.Add(new PostComment { PostId = postId, AuthorId = me, Text = t, CreatedAt = DateTime.UtcNow });
        if (post.AuthorId != me) Notify(post.AuthorId, "comment", me, postId);
        await db.SaveChangesAsync();
        return null;
    }

    /// <summary>The comment’s author or the post’s author may remove a comment.</summary>
    public async Task<bool> DeleteComment(string me, long commentId)
    {
        var c = await db.PostComments.FindAsync(commentId);
        if (c is null) return false;
        var post = await db.Posts.FindAsync(c.PostId);
        if (c.AuthorId != me && post?.AuthorId != me) return false;
        db.PostComments.Remove(c);
        await db.SaveChangesAsync();
        return true;
    }

    // ---------- notifications ----------

    private void Notify(string memberId, string kind, string actorId, long? postId) =>
        db.Notifications.Add(new Notification { MemberId = memberId, Kind = kind, ActorId = actorId, PostId = postId, CreatedAt = DateTime.UtcNow });

    public Task<int> Unread(string me) => db.Notifications.CountAsync(n => n.MemberId == me && n.ReadAt == null);

    public async Task<List<object>> Notifications(string me)
    {
        var list = await db.Notifications.AsNoTracking().Where(n => n.MemberId == me).OrderByDescending(n => n.Id).Take(50).ToListAsync();
        var people = await People(list.Select(n => n.ActorId));
        var snippets = await db.Posts.AsNoTracking().Where(p => list.Select(n => n.PostId).Contains(p.Id)).Select(p => new { p.Id, p.Text }).ToDictionaryAsync(p => p.Id, p => p.Text.Length > 80 ? p.Text[..80] + "…" : p.Text);
        return list.Where(n => people.ContainsKey(n.ActorId)).Select(n => (object)new
        {
            id = n.Id, kind = n.Kind, actor = people[n.ActorId], postId = n.PostId,
            post = n.PostId is long pid ? snippets.GetValueOrDefault(pid) : null, at = n.CreatedAt, unread = n.ReadAt is null,
        }).ToList();
    }

    public async Task MarkRead(string me) =>
        await db.Notifications.Where(n => n.MemberId == me && n.ReadAt == null).ExecuteUpdateAsync(s => s.SetProperty(n => n.ReadAt, DateTime.UtcNow));

    // ---------- helpers ----------

    private async Task<Dictionary<string, object>> People(IEnumerable<string> ids)
    {
        var set = ids.Distinct().ToList();
        var members = await db.Members.AsNoTracking().Where(m => set.Contains(m.Id)).ToListAsync();
        return members.ToDictionary(m => m.Id, m =>
        {
            var p = JsonNode.Parse(m.ProfileJson) as JsonObject ?? [];
            return (object)new { id = m.Id, name = m.Name, headline = m.Headline, kind = m.Kind, photo = p["photo"]?.DeepClone(), c = p["c"]?.DeepClone() };
        });
    }

    private static string? Clip(string? s, int max) { s = (s ?? "").Trim(); return s.Length == 0 ? null : s.Length > max ? s[..max] : s; }
}
