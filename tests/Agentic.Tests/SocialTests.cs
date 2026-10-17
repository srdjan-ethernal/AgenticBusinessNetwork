using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Agentic.Tests;

/// <summary>Connections, posts, the feed, likes, comments and notifications.</summary>
public sealed class SocialTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private async Task<(HttpClient c, string id)> Person(string email, string name)
    {
        var c = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
        var res = await c.PostAsJsonAsync("/api/auth/signup", new { name, email, password = "correct horse battery", headline = "Owner at Example", template = "founder" });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return (c, (string)(await res.Content.ReadFromJsonAsync<JsonObject>())!["id"]!);
    }

    private static async Task<long> Post(HttpClient c, string text)
    {
        var res = await c.PostAsJsonAsync("/api/posts", new { text });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return (long)(await res.Content.ReadFromJsonAsync<JsonObject>())!["id"]!;
    }

    private static async Task<List<long>> FeedIds(HttpClient c) =>
        (await c.GetFromJsonAsync<JsonArray>("/api/feed"))!.Select(p => (long)p!["id"]!).ToList();

    private static async Task Connect(HttpClient a, string bId, HttpClient b)
    {
        var sent = await a.PostAsJsonAsync("/api/connections", new { memberId = bId, note = "Met at the fair" });
        Assert.Equal("pending", (string)(await sent.Content.ReadFromJsonAsync<JsonObject>())!["state"]!);
        var reqs = await b.GetFromJsonAsync<JsonObject>("/api/connections/requests");
        var id = (long)reqs!["incoming"]!.AsArray().Last()!["id"]!;
        (await b.PostAsJsonAsync($"/api/connections/requests/{id}", new { accept = true })).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Connections_see_each_others_posts_and_strangers_dont()
    {
        var (ana, _) = await Person("ana@social.example", "Ana Social");
        var (bob, bobId) = await Person("bob@social.example", "Bob Social");
        var (eve, _) = await Person("eve@social.example", "Eve Stranger");

        var post = await Post(bob, "We just opened a second workshop in Novi Sad.");
        Assert.Contains(post, await FeedIds(bob));
        Assert.DoesNotContain(post, await FeedIds(ana));

        await Connect(ana, bobId, bob);
        Assert.Contains(post, await FeedIds(ana));
        Assert.DoesNotContain(post, await FeedIds(eve));

        var boot = await ana.GetFromJsonAsync<JsonObject>("/api/bootstrap");
        Assert.Equal("1st", (string)boot!["people"]![bobId]!["degree"]!);

        // Ana asked and Bob accepted, so Ana is told.
        var notes = await ana.GetFromJsonAsync<JsonArray>("/api/notifications");
        Assert.Contains(notes!, n => (string)n!["kind"]! == "accepted" && (string)n["actor"]!["id"]! == bobId);

        (await ana.DeleteAsync($"/api/connections/{bobId}")).EnsureSuccessStatusCode();
        Assert.DoesNotContain(post, await FeedIds(ana));

        // Anyone signed in can still open Bob's own activity.
        var activity = await eve.GetFromJsonAsync<JsonArray>($"/api/members/{bobId}/posts");
        Assert.Equal(post, (long)activity!.Single()!["id"]!);
    }

    [Fact]
    public async Task Requesting_someone_who_already_asked_you_connects_at_once()
    {
        var (a, aId) = await Person("a@mutual.example", "A Mutual");
        var (b, bId) = await Person("b@mutual.example", "B Mutual");
        await a.PostAsJsonAsync("/api/connections", new { memberId = bId });

        var boot = await b.GetFromJsonAsync<JsonObject>("/api/bootstrap");
        Assert.Equal(1, (int)boot!["social"]!["requestsIn"]!);
        var aBoot = await a.GetFromJsonAsync<JsonObject>("/api/bootstrap");
        Assert.Equal([bId], aBoot!["social"]!["outgoing"]!.AsArray().Select(x => (string)x!));

        var res = await b.PostAsJsonAsync("/api/connections", new { memberId = aId });
        Assert.Equal("connected", (string)(await res.Content.ReadFromJsonAsync<JsonObject>())!["state"]!);
        var after = await b.GetFromJsonAsync<JsonObject>("/api/connections/requests");
        Assert.Empty(after!["incoming"]!.AsArray());

        var self = await a.PostAsJsonAsync("/api/connections", new { memberId = aId });
        Assert.Equal(HttpStatusCode.BadRequest, self.StatusCode);
    }

    [Fact]
    public async Task Likes_and_comments_notify_the_author_once()
    {
        var (author, authorId) = await Person("author@likes.example", "Post Author");
        var (fan, fanId) = await Person("fan@likes.example", "Big Fan");
        var post = await Post(author, "Looking for a supplier of recycled cardboard.");

        var like = await (await fan.PostAsync($"/api/posts/{post}/like", null)).Content.ReadFromJsonAsync<JsonObject>();
        Assert.True((bool)like!["liked"]!);
        Assert.Equal(1, (int)like["likes"]!);
        var unlike = await (await fan.PostAsync($"/api/posts/{post}/like", null)).Content.ReadFromJsonAsync<JsonObject>();
        Assert.False((bool)unlike!["liked"]!);
        await fan.PostAsync($"/api/posts/{post}/like", null);

        var comments = await (await fan.PostAsJsonAsync($"/api/posts/{post}/comments", new { text = "We make that, sending you a knock." })).Content.ReadFromJsonAsync<JsonArray>();
        Assert.Equal(fanId, (string)comments!.Single()!["author"]!["id"]!);
        Assert.Equal(HttpStatusCode.BadRequest, (await fan.PostAsJsonAsync($"/api/posts/{post}/comments", new { text = "  " })).StatusCode);

        var notes = await author.GetFromJsonAsync<JsonArray>("/api/notifications");
        Assert.Single(notes!, n => (string)n!["kind"]! == "like");
        Assert.Single(notes!, n => (string)n!["kind"]! == "comment");
        Assert.Equal(2, (int)(await author.GetFromJsonAsync<JsonObject>("/api/bootstrap"))!["social"]!["unread"]!);
        (await author.PostAsync("/api/notifications/read", null)).EnsureSuccessStatusCode();
        Assert.Equal(0, (int)(await author.GetFromJsonAsync<JsonObject>("/api/bootstrap"))!["social"]!["unread"]!);

        var mine = (await author.GetFromJsonAsync<JsonArray>($"/api/members/{authorId}/posts"))!.Single()!;
        Assert.Equal(1, (int)mine["likes"]!);
        Assert.Equal(1, (int)mine["comments"]!);
        Assert.True((bool)mine["mine"]!);
    }

    [Fact]
    public async Task Only_the_author_deletes_a_post_and_either_side_deletes_a_comment()
    {
        var (author, _) = await Person("owner@delete.example", "Owner Delete");
        var (other, _) = await Person("other@delete.example", "Other Delete");
        var post = await Post(author, "Hello Knockero");
        var comments = await (await other.PostAsJsonAsync($"/api/posts/{post}/comments", new { text = "Welcome!" })).Content.ReadFromJsonAsync<JsonArray>();
        var commentId = (long)comments!.Single()!["id"]!;

        Assert.Equal(HttpStatusCode.NotFound, (await other.DeleteAsync($"/api/posts/{post}")).StatusCode);
        (await author.DeleteAsync($"/api/comments/{commentId}")).EnsureSuccessStatusCode();
        (await author.DeleteAsync($"/api/posts/{post}")).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/posts/{post}/comments")).StatusCode);
        Assert.Empty((await author.GetFromJsonAsync<JsonArray>("/api/notifications"))!);
    }

    [Fact]
    public async Task Posts_take_one_real_image_and_reject_bad_text()
    {
        var (c, _) = await Person("img@posts.example", "Image Poster");
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync("/api/posts", new { text = "" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync("/api/posts", new { text = new string('x', 3001) })).StatusCode);

        var post = await Post(c, "Our new showroom");
        var fake = new ByteArrayContent("<svg onload=alert(1)>"u8.ToArray());
        fake.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsync($"/api/posts/{post}/image", fake)).StatusCode);

        byte[] png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 0x49, 0x48, 0x44, 0x52];
        var img = new ByteArrayContent(png);
        img.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        (await c.PostAsync($"/api/posts/{post}/image", img)).EnsureSuccessStatusCode();

        var shown = (await c.GetFromJsonAsync<JsonArray>("/api/feed"))!.First()!;
        Assert.Equal($"api/posts/{post}/image", (string)shown["image"]!);
        var file = await c.GetAsync($"/api/posts/{post}/image");
        Assert.Equal("image/png", file.Content.Headers.ContentType!.MediaType);
        Assert.Equal("nosniff", file.Headers.GetValues("X-Content-Type-Options").Single());

        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.CreateClient().GetAsync("/api/feed")).StatusCode);
    }

    [Fact]
    public async Task Company_admins_post_as_the_company_and_staff_see_it()
    {
        var (owner, ownerId) = await Person("boss@posting.example", "Boss Posting");
        var created = await owner.PostAsJsonAsync("/api/companies", new { name = "Posting Works", tagline = "Signs and print", worksHere = true });
        var company = (string)(await created.Content.ReadFromJsonAsync<JsonObject>())!["id"]!;

        var req = new HttpRequestMessage(HttpMethod.Post, "/api/posts") { Content = JsonContent.Create(new { text = "We are hiring a print operator." }) };
        req.Headers.Add("X-Act-As", company);
        var res = await owner.SendAsync(req);
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var id = (long)(await res.Content.ReadFromJsonAsync<JsonObject>())!["id"]!;

        var feed = await owner.GetFromJsonAsync<JsonArray>("/api/feed");
        var shown = feed!.Single(p => (long)p!["id"]! == id)!;
        Assert.Equal(company, (string)shown["author"]!["id"]!);
        Assert.Equal("company", (string)shown["author"]!["kind"]!);

        // Someone who doesn't manage it can't post as the company.
        var (stranger, _) = await Person("x@posting.example", "Not Admin");
        var bad = new HttpRequestMessage(HttpMethod.Post, "/api/posts") { Content = JsonContent.Create(new { text = "Hijack" }) };
        bad.Headers.Add("X-Act-As", company);
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.SendAsync(bad)).StatusCode);

        // Company pages can't send connection requests.
        var connect = new HttpRequestMessage(HttpMethod.Post, "/api/connections") { Content = JsonContent.Create(new { memberId = ownerId }) };
        connect.Headers.Add("X-Act-As", company);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.SendAsync(connect)).StatusCode);
    }
}
