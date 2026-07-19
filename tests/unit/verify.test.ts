import { describe, expect, it } from "vitest";
import { emptyProfile, materializeProfile, type Profile } from "@/lib/profile/schema";
import type { TailoredResume } from "@/lib/tailor/generate";
import { extractNumbers, extractProperSequences, verifyTailoredResume } from "@/lib/tailor/verify";

function fixtureProfile(): Profile {
  return materializeProfile({
    ...emptyProfile(),
    basics: { ...emptyProfile().basics, fullName: "Jane Smith" },
    experience: [
      {
        employer: "Acme Corp",
        title: "Senior Software Engineer",
        location: null,
        startDate: "2019",
        endDate: null,
        isCurrent: true,
        bullets: [
          { text: "Migrated billing services to Kubernetes, serving 2 million users" },
          { text: "Cut infrastructure costs 35% through capacity planning" }
        ]
      }
    ],
    skills: [{ name: "Kubernetes", category: null }]
  });
}

describe("extractNumbers", () => {
  it("finds and normalizes digit groups", () => {
    expect(extractNumbers("Cut costs 35% on 2,000 nodes in 3.5 months")).toEqual([
      "35",
      "2000",
      "35"
    ]);
  });
});

describe("extractProperSequences", () => {
  it("captures proper nouns and acronyms but exempts sentence-leading words", () => {
    expect(extractProperSequences("Led migration to Google Cloud using AWS tools.")).toEqual([
      "Google Cloud",
      "AWS"
    ]);
    expect(extractProperSequences("Improved reliability across the fleet.")).toEqual([]);
  });

  it("captures sentence-leading sequences that continue", () => {
    expect(extractProperSequences("Acme Corp promoted me twice.")).toEqual(["Acme Corp"]);
  });
});

describe("verifyTailoredResume", () => {
  function tailoredWith(profile: Profile, bulletText: string, sourceIds: string[]): TailoredResume {
    const experience = profile.experience[0];
    if (!experience) {
      throw new Error("fixture requires experience");
    }
    return {
      summary: null,
      experience: [{ experienceId: experience.id, bullets: [{ text: bulletText, sourceIds }] }],
      skillIds: [],
      coverLetter: null
    };
  }

  it("accepts faithful rewrites citing real sources", () => {
    const profile = fixtureProfile();
    const bulletId = profile.experience[0]?.bullets[0]?.id ?? "";
    const report = verifyTailoredResume(
      profile,
      tailoredWith(profile, "Moved billing onto Kubernetes for 2 million users", [bulletId]),
      "job text"
    );
    expect(report.valid).toBe(true);
    expect(report.claims[0]?.status).toBe("supported");
  });

  it("blocks lines citing nonexistent sources", () => {
    const profile = fixtureProfile();
    const report = verifyTailoredResume(
      profile,
      tailoredWith(profile, "Moved billing onto Kubernetes", ["does-not-exist"]),
      "job text"
    );
    expect(report.valid).toBe(false);
    expect(report.claims[0]?.problems[0]).toContain("does not exist");
  });

  it("blocks numbers that are not in the cited sources", () => {
    const profile = fixtureProfile();
    const bulletId = profile.experience[0]?.bullets[0]?.id ?? "";
    const report = verifyTailoredResume(
      profile,
      tailoredWith(profile, "Served 90 million users on Kubernetes", [bulletId]),
      "job text"
    );
    expect(report.valid).toBe(false);
    expect(report.claims[0]?.problems.some((p) => p.includes('"90"'))).toBe(true);
  });

  it("blocks proper nouns that are not in the cited sources", () => {
    const profile = fixtureProfile();
    const bulletId = profile.experience[0]?.bullets[0]?.id ?? "";
    const report = verifyTailoredResume(
      profile,
      tailoredWith(profile, "Migrated billing to Google Cloud Platform", [bulletId]),
      "job text"
    );
    expect(report.valid).toBe(false);
    expect(report.claims[0]?.problems.some((p) => p.includes("Google Cloud Platform"))).toBe(true);
  });

  it("blocks references to unknown experience or skill ids", () => {
    const profile = fixtureProfile();
    const tailored: TailoredResume = {
      summary: null,
      experience: [{ experienceId: "ghost-role", bullets: [] }],
      skillIds: ["ghost-skill"],
      coverLetter: null
    };
    const report = verifyTailoredResume(profile, tailored, "job text");
    expect(report.valid).toBe(false);
    expect(report.unsupportedCount).toBe(2);
  });

  it("lets cover letters reference the posting but not invent candidate facts", () => {
    const profile = fixtureProfile();
    const bulletId = profile.experience[0]?.bullets[1]?.id ?? "";
    const tailored: TailoredResume = {
      summary: null,
      experience: [],
      skillIds: [],
      coverLetter: [
        { text: "I am excited to apply to Globex Industries for this role.", sourceIds: [] },
        { text: "At Acme Corp I cut infrastructure costs 35%.", sourceIds: [bulletId] },
        { text: "I also once won a Nobel Prize.", sourceIds: [] }
      ]
    };
    const report = verifyTailoredResume(
      profile,
      tailored,
      "Globex Industries is hiring engineers."
    );
    const statuses = report.claims.map((c) => c.status);
    expect(statuses[0]).toBe("supported"); // company name comes from the posting
    expect(statuses[1]).toBe("supported"); // cited fact
    expect(statuses[2]).toBe("unsupported"); // invented distinction
  });

  it("verifies summaries against cited sources", () => {
    const profile = fixtureProfile();
    const bulletIds = profile.experience[0]?.bullets.map((b) => b.id) ?? [];
    const good = verifyTailoredResume(
      profile,
      {
        summary: {
          text: "Engineer who cut costs 35% and served 2 million users.",
          sourceIds: bulletIds
        },
        experience: [],
        skillIds: [],
        coverLetter: null
      },
      "job"
    );
    expect(good.valid).toBe(true);

    const bad = verifyTailoredResume(
      profile,
      {
        summary: { text: "Engineer with 15 years of experience.", sourceIds: bulletIds },
        experience: [],
        skillIds: [],
        coverLetter: null
      },
      "job"
    );
    expect(bad.valid).toBe(false);
  });
});
