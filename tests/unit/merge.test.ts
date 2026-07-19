import { describe, expect, it } from "vitest";
import type { Extraction } from "@/lib/profile/extraction";
import { mergeExtractions } from "@/lib/profile/merge";

function emptyExtraction(): Extraction {
  return {
    basics: { fullName: null, headline: null, email: null, phone: null, location: null, links: [] },
    summary: null,
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    projects: [],
    awards: [],
    languages: []
  };
}

describe("mergeExtractions", () => {
  it("passes a single extraction through unchanged", () => {
    const one = emptyExtraction();
    one.skills = [{ name: "Python", category: null }];
    expect(mergeExtractions([one])).toEqual(one);
  });

  it("unions bullets for the same role split across chunks", () => {
    const a = emptyExtraction();
    a.experience = [
      {
        employer: "Acme Corp",
        title: "Engineer",
        location: null,
        startDate: "2019",
        endDate: null,
        isCurrent: true,
        bullets: ["Built the billing system"]
      }
    ];
    const b = emptyExtraction();
    b.experience = [
      {
        employer: "ACME CORP",
        title: "engineer",
        location: "Berlin",
        startDate: null,
        endDate: null,
        isCurrent: false,
        bullets: ["Built the billing system", "Mentored four engineers"]
      }
    ];
    const merged = mergeExtractions([a, b]);
    expect(merged.experience).toHaveLength(1);
    const entry = merged.experience[0];
    expect(entry?.bullets).toEqual(["Built the billing system", "Mentored four engineers"]);
    expect(entry?.startDate).toBe("2019");
    expect(entry?.location).toBe("Berlin");
    expect(entry?.isCurrent).toBe(true);
  });

  it("dedupes skills case-insensitively and links by url", () => {
    const a = emptyExtraction();
    a.skills = [{ name: "PostgreSQL", category: null }];
    a.basics.links = [{ label: "GitHub", url: "https://github.com/jane" }];
    const b = emptyExtraction();
    b.skills = [
      { name: "postgresql", category: "Databases" },
      { name: "Rust", category: null }
    ];
    b.basics.links = [{ label: "gh", url: "https://github.com/jane" }];
    const merged = mergeExtractions([a, b]);
    expect(merged.skills.map((s) => s.name)).toEqual(["PostgreSQL", "Rust"]);
    expect(merged.basics.links).toHaveLength(1);
  });

  it("takes the first non-null basics fields and the longest summary", () => {
    const a = emptyExtraction();
    a.basics.email = null;
    a.summary = "Short.";
    const b = emptyExtraction();
    b.basics.email = "jane@example.com";
    b.summary = "A much longer and more complete professional summary.";
    const merged = mergeExtractions([a, b]);
    expect(merged.basics.email).toBe("jane@example.com");
    expect(merged.summary).toBe("A much longer and more complete professional summary.");
  });
});
