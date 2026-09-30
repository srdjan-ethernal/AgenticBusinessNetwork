using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Agentic.Api.Migrations
{
    /// <inheritdoc />
    public partial class AgentBriefs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "BriefAt",
                table: "Intents",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BriefJson",
                table: "Intents",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BriefModel",
                table: "Intents",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BriefStatus",
                table: "Intents",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AiUsage",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Source = table.Column<string>(type: "TEXT", nullable: false),
                    MemberId = table.Column<string>(type: "TEXT", nullable: true),
                    Model = table.Column<string>(type: "TEXT", nullable: false),
                    InputTokens = table.Column<int>(type: "INTEGER", nullable: false),
                    OutputTokens = table.Column<int>(type: "INTEGER", nullable: false),
                    CostUsd = table.Column<decimal>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiUsage", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Intents_BriefStatus",
                table: "Intents",
                column: "BriefStatus");

            migrationBuilder.CreateIndex(
                name: "IX_AiUsage_CreatedAt",
                table: "AiUsage",
                column: "CreatedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AiUsage");

            migrationBuilder.DropIndex(
                name: "IX_Intents_BriefStatus",
                table: "Intents");

            migrationBuilder.DropColumn(
                name: "BriefAt",
                table: "Intents");

            migrationBuilder.DropColumn(
                name: "BriefJson",
                table: "Intents");

            migrationBuilder.DropColumn(
                name: "BriefModel",
                table: "Intents");

            migrationBuilder.DropColumn(
                name: "BriefStatus",
                table: "Intents");
        }
    }
}
