using System.IO.Compression;
using System.Text;

namespace Agentic.Api.Services;

public sealed record LinkedInProfileData(
    string? Headline, string? About, string? Location,
    List<ExperienceItem> Experience, List<EducationItem> Education, List<string> Skills);

/// <summary>Reads the member's own profile from LinkedIn's data export: Profile.csv, Positions.csv,
/// Education.csv and Skills.csv. Nothing is stored here; the member reviews it and saves what they want.</summary>
public static class LinkedInProfile
{
    public static (LinkedInProfileData? data, string? error) Read(byte[] zipBytes)
    {
        if (zipBytes.Length < 4 || zipBytes[0] != 'P' || zipBytes[1] != 'K')
            return (null, "Upload the .zip file you downloaded from LinkedIn (Settings → Data privacy → Get a copy of your data).");
        try
        {
            using var zip = new ZipArchive(new MemoryStream(zipBytes), ZipArchiveMode.Read);
            var positions = Table(zip, "Positions.csv");
            var education = Table(zip, "Education.csv");
            var skills = Table(zip, "Skills.csv");
            var profile = Table(zip, "Profile.csv");
            if (positions is null && education is null && skills is null && profile is null)
                return (null, "This export has no profile files (Positions, Education, Skills). Request the full archive from LinkedIn, or at least those parts.");

            var me = profile?.FirstOrDefault();
            var data = new LinkedInProfileData(
                Get(me, "Headline"), Get(me, "Summary"), Get(me, "Geo Location"),
                (positions ?? []).Select(r => new ExperienceItem(Get(r, "Title"), Get(r, "Company Name"), null, Get(r, "Started On"), Get(r, "Finished On"), Get(r, "Location"), Get(r, "Description")))
                    .Where(e => e.Title is not null || e.Company is not null).Take(30).ToList(),
                (education ?? []).Select(r => new EducationItem(Get(r, "School Name"), Get(r, "Degree Name"), Get(r, "Start Date"), Get(r, "End Date")))
                    .Where(e => e.School is not null).Take(15).ToList(),
                (skills ?? []).Select(r => Get(r, "Name")).OfType<string>().Distinct().Take(60).ToList());
            return (data, null);
        }
        catch (InvalidDataException) { return (null, "That zip file can’t be read."); }
    }

    /// <summary>A CSV from the archive as rows of column → value (header = first row that has cells).</summary>
    private static List<Dictionary<string, string>>? Table(ZipArchive zip, string name)
    {
        var entry = zip.Entries.FirstOrDefault(e => e.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
        if (entry is null || entry.Length > 5_000_000) return null;
        using var reader = new StreamReader(entry.Open(), Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
        var rows = Contacts.Csv(reader.ReadToEnd());
        if (rows.Count == 0) return [];
        var header = rows[0].Select(h => h.Trim()).ToList();
        return rows.Skip(1).Where(r => r.Any(c => c.Trim().Length > 0)).Select(r =>
        {
            var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (var i = 0; i < header.Count && i < r.Count; i++) d[header[i]] = r[i];
            return d;
        }).ToList();
    }

    private static string? Get(Dictionary<string, string>? row, string column) =>
        row is not null && row.TryGetValue(column, out var v) && v.Trim().Length > 0 ? v.Trim() : null;
}
