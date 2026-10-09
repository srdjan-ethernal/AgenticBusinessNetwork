using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Agentic.Tests;

/// <summary>Profile photo, experience, education, skills, and filling them from a LinkedIn export.</summary>
public sealed class ProfileTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private HttpClient Client() => factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });

    private async Task<(HttpClient c, string id)> Member(string email, string name)
    {
        var c = Client();
        var res = await c.PostAsJsonAsync("/api/auth/signup", new { name, email, password = "correct horse battery", headline = "Founder at Example", template = "founder" });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return (c, (string)(await res.Content.ReadFromJsonAsync<JsonObject>())!["id"]!);
    }

    private static ByteArrayContent Bytes(byte[] data)
    {
        var content = new ByteArrayContent(data);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        return content;
    }

    private static readonly byte[] Png = [0x89, (byte)'P', (byte)'N', (byte)'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, (byte)'I', (byte)'H', (byte)'D', (byte)'R'];

    [Fact]
    public async Task Experience_education_and_skills_are_saved_and_validated()
    {
        var (c, id) = await Member("cv@example.org", "Cee Vee");
        var res = await c.PutAsJsonAsync("/api/profile", new
        {
            experience = new object[]
            {
                new { title = "CTO", company = "Northwind", type = "Full-time", start = "Mar 2021", end = (string?)null, location = "Belgrade", description = "Built the platform." },
                new { title = "", company = "", type = "", start = "", end = "", location = "", description = "" },   // empty rows are dropped
            },
            education = new[] { new { school = "University of Novi Sad", degree = "MSc, Computer Science", start = "2008", end = "2013" } },
            skills = new[] { "C#", "Distributed systems", "c#", "  " },
        });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var me = (await res.Content.ReadFromJsonAsync<JsonObject>())!["people"]![id]!;
        var exp = me["exp"]!.AsArray().Single()!;
        Assert.Equal("CTO", (string)exp["title"]!);
        Assert.Equal("Northwind", (string)exp["company"]!);
        Assert.Null(exp["end"]);
        Assert.Equal("MSc, Computer Science", (string)me["edu"]![0]!["deg"]!);
        Assert.Equal(["C#", "Distributed systems"], me["skills"]!.AsArray().Select(s => (string)s!));

        var noTitle = await c.PutAsJsonAsync("/api/profile", new { experience = new[] { new { title = "", company = "Acme" } } });
        Assert.Equal(HttpStatusCode.BadRequest, noTitle.StatusCode);
        var tooMany = await c.PutAsJsonAsync("/api/profile", new { skills = Enumerable.Range(1, 61).Select(i => "Skill " + i) });
        Assert.Equal(HttpStatusCode.BadRequest, tooMany.StatusCode);
    }

    [Fact]
    public async Task Photo_upload_is_served_with_a_versioned_url_and_can_be_removed()
    {
        var (c, id) = await Member("photo@example.org", "Pho To");
        var res = await c.PostAsync("/api/profile/photo", Bytes(Png));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var url = (string)(await res.Content.ReadFromJsonAsync<JsonObject>())!["people"]![id]!["photo"]!;
        Assert.StartsWith("api/members/" + id + "/photo?v=", url);

        var img = await Client().GetAsync("/" + url);   // public
        Assert.Equal(HttpStatusCode.OK, img.StatusCode);
        Assert.Equal("image/png", img.Content.Headers.ContentType!.MediaType);
        Assert.Contains("immutable", img.Headers.CacheControl!.ToString());
        Assert.Equal(Png, await img.Content.ReadAsByteArrayAsync());

        // Only real raster images; SVG and anything else is refused.
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsync("/api/profile/photo", Bytes(Encoding.UTF8.GetBytes("<svg onload=alert(1)>")))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsync("/api/profile/photo", Bytes(new byte[ProfileLimits.TooBig]))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().PostAsync("/api/profile/photo", Bytes(Png))).StatusCode);

        var removed = await c.DeleteAsync("/api/profile/photo");
        Assert.Null((await removed.Content.ReadFromJsonAsync<JsonObject>())!["people"]![id]!["photo"]);
        Assert.Equal(HttpStatusCode.NotFound, (await Client().GetAsync("/api/members/" + id + "/photo")).StatusCode);
    }

    [Fact]
    public async Task Reads_the_profile_from_a_linkedin_export_without_saving_it()
    {
        var (c, id) = await Member("li@example.org", "Li Export");
        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, true))
        {
            void Add(string name, string text) { using var w = new StreamWriter(zip.CreateEntry(name).Open(), new UTF8Encoding(false)); w.Write(text); }
            Add("Profile.csv", "First Name,Last Name,Maiden Name,Address,Birth Date,Headline,Summary,Industry,Zip Code,Geo Location,Twitter Handles,Websites,Instant Messengers\nLi,Export,,,,CTO at Northwind,\"I build things.\nMostly platforms.\",Software,,\"Belgrade, Serbia\",,,\n");
            Add("Positions.csv", "Company Name,Title,Description,Location,Started On,Finished On\nNorthwind,CTO,\"Platform, team, hiring\",Belgrade,Mar 2021,\nAcme,Engineer,,,Jan 2015,Feb 2021\n");
            Add("Education.csv", "School Name,Start Date,End Date,Notes,Degree Name,Activities\nUniversity of Novi Sad,2008,2013,,MSc,\n");
            Add("Skills.csv", "Name\nC#\nDistributed Systems\n");
            Add("Connections.csv", "First Name,Last Name\nA,B\n");
        }
        var res = await c.PostAsync("/api/profile/linkedin", Bytes(ms.ToArray()));
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var data = (await res.Content.ReadFromJsonAsync<JsonObject>())!;
        Assert.Equal("CTO at Northwind", (string)data["headline"]!);
        Assert.Equal("I build things.\nMostly platforms.", (string)data["about"]!);
        Assert.Equal("Belgrade, Serbia", (string)data["location"]!);
        Assert.Equal(2, data["experience"]!.AsArray().Count);
        Assert.Equal("Northwind", (string)data["experience"]![0]!["company"]!);
        Assert.Null(data["experience"]![0]!["end"]);
        Assert.Equal("Feb 2021", (string)data["experience"]![1]!["end"]!);
        Assert.Equal("MSc", (string)data["education"]![0]!["degree"]!);
        Assert.Equal(["C#", "Distributed Systems"], data["skills"]!.AsArray().Select(s => (string)s!));

        // Nothing was saved yet.
        var boot = await c.GetFromJsonAsync<JsonObject>("/api/bootstrap");
        Assert.Null(boot!["people"]![id]!["exp"]);

        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsync("/api/profile/linkedin", Bytes(Encoding.UTF8.GetBytes("not a zip")))).StatusCode);
        using var empty = new MemoryStream();
        using (var zip = new ZipArchive(empty, ZipArchiveMode.Create, true)) zip.CreateEntry("Invitations.csv");
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsync("/api/profile/linkedin", Bytes(empty.ToArray()))).StatusCode);
    }

    private static class ProfileLimits { public const int TooBig = 1024 * 1024 + 1; }
}
