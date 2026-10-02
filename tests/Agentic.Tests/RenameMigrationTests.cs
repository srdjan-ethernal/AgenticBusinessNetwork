using Agentic.Api.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Agentic.Tests;

/// <summary>A database created before the rename (agent addresses @agentic) is moved to @knockero on start.</summary>
public sealed class RenameMigrationTests
{
    [Fact]
    public async Task Existing_addresses_and_the_company_page_get_the_new_name()
    {
        var path = Path.Combine(Path.GetTempPath(), "agentic-rename-" + Guid.NewGuid().ToString("N") + ".db");
        try
        {
            var options = new DbContextOptionsBuilder<AgenticDb>().UseSqlite("Data Source=" + path).Options;
            await using (var db = new AgenticDb(options))
            {
                await db.GetService<IMigrator>().MigrateAsync("20260930043951_AccountEmailsAndDigest");
                await db.Database.ExecuteSqlRawAsync("""
                    INSERT INTO "Members" ("Id","Name","Kind","Headline","AgentAddress","Reputation","AbuseFlags","Verified","Template","ProfileJson","CreatedAt","EmailVerified","DigestEnabled")
                    VALUES ('maya-okafor','Maya Okafor','person','GP','maya.okafor@agentic',80,0,'[]','investor','{{"addr":"maya.okafor@agentic"}}','2026-09-01 00:00:00',0,1),
                           ('other','Other','person','x','someone@elsewhere',50,0,'[]','founder','{{}}','2026-09-01 00:00:00',0,1);
                    INSERT INTO "Organizations" ("Id","Name","Verified","ProfileJson") VALUES ('abn','Agentic Business Network',1,'{{"name":"Agentic Business Network"}}');
                    """);
            }
            await using (var db = new AgenticDb(options))
            {
                await db.Database.MigrateAsync();
                var maya = await db.Members.FindAsync("maya-okafor");
                Assert.Equal("maya.okafor@knockero", maya!.AgentAddress);
                Assert.Contains("maya.okafor@knockero", maya.ProfileJson);
                Assert.Equal("someone@elsewhere", (await db.Members.FindAsync("other"))!.AgentAddress);
                var org = await db.Organizations.FindAsync("abn");
                Assert.Equal("Knockero", org!.Name);
                Assert.Contains("Knockero", org.ProfileJson);
            }
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            foreach (var f in new[] { path, path + "-shm", path + "-wal" })
                if (File.Exists(f)) File.Delete(f);
        }
    }
}
