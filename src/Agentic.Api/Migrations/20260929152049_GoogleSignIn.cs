using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Agentic.Api.Migrations
{
    /// <inheritdoc />
    public partial class GoogleSignIn : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "EmailVerified",
                table: "Members",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "GoogleSubject",
                table: "Members",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Members_GoogleSubject",
                table: "Members",
                column: "GoogleSubject",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Members_GoogleSubject",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "EmailVerified",
                table: "Members");

            migrationBuilder.DropColumn(
                name: "GoogleSubject",
                table: "Members");
        }
    }
}
