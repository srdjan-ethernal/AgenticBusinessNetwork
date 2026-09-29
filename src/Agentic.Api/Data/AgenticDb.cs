using Microsoft.EntityFrameworkCore;

namespace Agentic.Api.Data;

public sealed class AgenticDb(DbContextOptions<AgenticDb> options) : DbContext(options)
{
    public DbSet<Member> Members => Set<Member>();
    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<Relationship> Relationships => Set<Relationship>();
    public DbSet<PolicyRecord> Policies => Set<PolicyRecord>();
    public DbSet<Intent> Intents => Set<Intent>();
    public DbSet<IntentMessage> Messages => Set<IntentMessage>();
    public DbSet<DecisionLog> Decisions => Set<DecisionLog>();
    public DbSet<AbuseReport> AbuseReports => Set<AbuseReport>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Member>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.AgentAddress).IsUnique();
        });
        b.Entity<Organization>().HasKey(x => x.Id);
        b.Entity<Relationship>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.MemberId, x.OtherId }).IsUnique();
        });
        b.Entity<PolicyRecord>().HasKey(x => x.OwnerId);
        b.Entity<Intent>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.RecipientId);
            e.HasIndex(x => x.SenderId);
            e.Ignore(x => x.EffectiveLane);
        });
        b.Entity<IntentMessage>().HasIndex(x => x.IntentId);
        b.Entity<DecisionLog>().HasIndex(x => x.IntentId);
    }
}
