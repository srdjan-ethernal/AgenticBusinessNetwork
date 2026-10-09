using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Agentic.Api.Migrations
{
    /// <inheritdoc />
    public partial class CompanyPages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OrgAdmins",
                columns: table => new
                {
                    OrgId = table.Column<string>(type: "TEXT", nullable: false),
                    MemberId = table.Column<string>(type: "TEXT", nullable: false),
                    AddedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrgAdmins", x => new { x.OrgId, x.MemberId });
                });

            migrationBuilder.CreateIndex(
                name: "IX_Members_OrgId",
                table: "Members",
                column: "OrgId");

            migrationBuilder.CreateIndex(
                name: "IX_OrgAdmins_MemberId",
                table: "OrgAdmins",
                column: "MemberId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OrgAdmins");

            migrationBuilder.DropIndex(
                name: "IX_Members_OrgId",
                table: "Members");
        }
    }
}
