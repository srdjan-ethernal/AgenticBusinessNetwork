using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Agentic.Api.Migrations
{
    /// <summary>The product is now Knockero: agent addresses move from @agentic to @knockero, and the
    /// network's own company page gets the new name. Plain SQL that runs on SQLite and Postgres.</summary>
    public partial class RenameToKnockero : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE "Members" SET "AgentAddress" = substr("AgentAddress", 1, length("AgentAddress") - 8) || '@knockero'
                WHERE "AgentAddress" LIKE '%@agentic';
                """);
            migrationBuilder.Sql("""UPDATE "Members" SET "ProfileJson" = replace("ProfileJson", '@agentic"', '@knockero"') WHERE "ProfileJson" LIKE '%@agentic"%';""");
            migrationBuilder.Sql("""
                UPDATE "Organizations" SET "Name" = replace("Name", 'Agentic Business Network', 'Knockero'),
                    "ProfileJson" = replace("ProfileJson", 'Agentic Business Network', 'Knockero')
                WHERE "Name" LIKE '%Agentic Business Network%' OR "ProfileJson" LIKE '%Agentic Business Network%';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE "Members" SET "AgentAddress" = substr("AgentAddress", 1, length("AgentAddress") - 9) || '@agentic'
                WHERE "AgentAddress" LIKE '%@knockero';
                """);
            migrationBuilder.Sql("""UPDATE "Members" SET "ProfileJson" = replace("ProfileJson", '@knockero"', '@agentic"') WHERE "ProfileJson" LIKE '%@knockero"%';""");
            migrationBuilder.Sql("""UPDATE "Organizations" SET "Name" = replace("Name", 'Knockero', 'Agentic Business Network'), "ProfileJson" = replace("ProfileJson", 'Knockero', 'Agentic Business Network') WHERE "Id" = 'abn';""");
        }
    }
}
