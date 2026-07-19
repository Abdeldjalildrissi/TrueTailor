import { describe, expect, it } from "vitest";
import { emptyProfile, materializeProfile, type Profile } from "@/lib/profile/schema";
import type { GroundedRequirement } from "@/lib/tailor/job-analysis";
import { rankProfile } from "@/lib/tailor/rank";

function fixtureProfile(): Profile {
  return materializeProfile({
    ...emptyProfile(),
    experience: [
      {
        employer: "Acme Corp",
        title: "Senior Software Engineer",
        location: null,
        startDate: "2019",
        endDate: null,
        isCurrent: true,
        bullets: [
          { text: "Migrated billing services to Kubernetes across three regions" },
          { text: "Cut infrastructure costs 35% through capacity planning" }
        ]
      },
      {
        employer: "Initech",
        title: "Software Engineer",
        location: null,
        startDate: "2015",
        endDate: "2019",
        isCurrent: false,
        bullets: [{ text: "Built reporting tools in Python" }]
      }
    ],
    skills: [
      { name: "Python", category: null },
      { name: "Kubernetes", category: null }
    ]
  });
}

function requirement(
  id: string,
  text: string,
  keywords: string[],
  kind: "must" | "nice" = "must"
): GroundedRequirement {
  return { id, text, kind, keywords };
}

describe("rankProfile", () => {
  it("marks requirements covered by skills as full", () => {
    const result = rankProfile(fixtureProfile(), [
      requirement("r1", "Experience with Kubernetes", ["Kubernetes"])
    ]);
    expect(result.requirementMatches[0]?.strength).toBe("full");
    expect(result.gaps).toHaveLength(0);
  });

  it("marks requirements matched by a single bullet as partial", () => {
    const result = rankProfile(fixtureProfile(), [
      requirement("r1", "Experience with capacity planning", ["capacity planning"])
    ]);
    expect(result.requirementMatches[0]?.strength).toBe("partial");
    expect(result.gaps).toHaveLength(1);
  });

  it("marks unmatched requirements as explicit gaps", () => {
    const result = rankProfile(fixtureProfile(), [
      requirement("r1", "Rust systems programming", ["Rust"]),
      requirement("r2", "Security clearance", ["clearance"], "nice")
    ]);
    expect(result.requirementMatches.map((m) => m.strength)).toEqual(["none", "none"]);
    expect(result.gaps).toHaveLength(2);
  });

  it("ranks the experience that covers more weighted requirements first", () => {
    const profile = fixtureProfile();
    const result = rankProfile(profile, [
      requirement("r1", "Kubernetes in production", ["Kubernetes"]),
      requirement("r2", "Cost optimization", ["infrastructure costs"]),
      requirement("r3", "Python", ["Python"], "nice")
    ]);
    const acmeId = profile.experience[0]?.id;
    expect(result.rankedExperience[0]?.experienceId).toBe(acmeId);
    expect(result.rankedExperience[0]?.score).toBeGreaterThan(
      result.rankedExperience[1]?.score ?? 0
    );
  });

  it("is deterministic", () => {
    const profile = fixtureProfile();
    const requirements = [
      requirement("r1", "Kubernetes in production", ["Kubernetes"]),
      requirement("r2", "Python scripting", ["Python"])
    ];
    const a = rankProfile(profile, requirements);
    const b = rankProfile(profile, requirements);
    expect(a).toEqual(b);
  });

  it("does not match trivially short keywords", () => {
    const result = rankProfile(fixtureProfile(), [requirement("r1", "C experience", ["C"])]);
    expect(result.requirementMatches[0]?.strength).toBe("none");
  });
});
