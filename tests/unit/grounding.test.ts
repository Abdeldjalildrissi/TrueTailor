import { describe, expect, it } from "vitest";
import type { Extraction } from "@/lib/profile/extraction";
import { verifyExtractionGrounded } from "@/lib/profile/grounding";

const SOURCE = `Jane Smith
Senior Software Engineer at Acme Corp since 2019.
- Led the manage-
ment of data pipelines processing 2 million events daily
- Reduced costs by 35% across the platform
Skills: Python, Kubernetes
Education: State University, BS Computer Science, 2015
Summary: Engineer focused on reliability. Deeply experienced with distributed systems.`;

function baseExtraction(): Extraction {
  return {
    basics: {
      fullName: "Jane Smith",
      headline: null,
      email: null,
      phone: null,
      location: null,
      links: []
    },
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

describe("verifyExtractionGrounded", () => {
  it("keeps entries whose text appears in the source", () => {
    const extraction = baseExtraction();
    extraction.experience = [
      {
        employer: "Acme Corp",
        title: "Senior Software Engineer",
        location: null,
        startDate: "2019",
        endDate: null,
        isCurrent: true,
        bullets: ["Reduced costs by 35% across the platform"]
      }
    ];
    extraction.skills = [{ name: "Python", category: null }];
    const { extraction: grounded, warnings } = verifyExtractionGrounded(extraction, SOURCE);
    expect(grounded.experience).toHaveLength(1);
    expect(grounded.experience[0]?.bullets).toHaveLength(1);
    expect(grounded.skills).toHaveLength(1);
    expect(warnings).toHaveLength(0);
  });

  it("tolerates hyphenated line wraps from PDF extraction", () => {
    const extraction = baseExtraction();
    extraction.experience = [
      {
        employer: "Acme Corp",
        title: "Senior Software Engineer",
        location: null,
        startDate: null,
        endDate: null,
        isCurrent: false,
        bullets: ["Led the management of data pipelines processing 2 million events daily"]
      }
    ];
    const { extraction: grounded, warnings } = verifyExtractionGrounded(extraction, SOURCE);
    expect(grounded.experience[0]?.bullets).toHaveLength(1);
    expect(warnings).toHaveLength(0);
  });

  it("removes fabricated employers entirely", () => {
    const extraction = baseExtraction();
    extraction.experience = [
      {
        employer: "Globex Corporation",
        title: "VP of Engineering",
        location: null,
        startDate: null,
        endDate: null,
        isCurrent: false,
        bullets: ["Ran everything"]
      }
    ];
    const { extraction: grounded, warnings } = verifyExtractionGrounded(extraction, SOURCE);
    expect(grounded.experience).toHaveLength(0);
    expect(warnings.some((w) => w.section === "experience" && w.value.includes("Globex"))).toBe(
      true
    );
  });

  it("removes fabricated bullets but keeps the real entry", () => {
    const extraction = baseExtraction();
    extraction.experience = [
      {
        employer: "Acme Corp",
        title: "Senior Software Engineer",
        location: null,
        startDate: null,
        endDate: null,
        isCurrent: false,
        bullets: [
          "Reduced costs by 35% across the platform",
          "Single-handedly rewrote the kernel in a weekend"
        ]
      }
    ];
    const { extraction: grounded, warnings } = verifyExtractionGrounded(extraction, SOURCE);
    expect(grounded.experience).toHaveLength(1);
    expect(grounded.experience[0]?.bullets).toEqual(["Reduced costs by 35% across the platform"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.value).toContain("kernel");
  });

  it("filters fabricated skills and certifications", () => {
    const extraction = baseExtraction();
    extraction.skills = [
      { name: "Python", category: null },
      { name: "Blockchain", category: null }
    ];
    extraction.certifications = [{ name: "AWS Solutions Architect", issuer: null, date: null }];
    const { extraction: grounded, warnings } = verifyExtractionGrounded(extraction, SOURCE);
    expect(grounded.skills.map((s) => s.name)).toEqual(["Python"]);
    expect(grounded.certifications).toHaveLength(0);
    expect(warnings).toHaveLength(2);
  });

  it("nulls dates whose year is absent from the document", () => {
    const extraction = baseExtraction();
    extraction.experience = [
      {
        employer: "Acme Corp",
        title: "Senior Software Engineer",
        location: null,
        startDate: "2019-03",
        endDate: "2027-01",
        isCurrent: false,
        bullets: []
      }
    ];
    const { extraction: grounded, warnings } = verifyExtractionGrounded(extraction, SOURCE);
    expect(grounded.experience[0]?.startDate).toBe("2019-03");
    expect(grounded.experience[0]?.endDate).toBeNull();
    expect(warnings.some((w) => w.reason.includes("2027"))).toBe(true);
  });

  it("keeps supported summary sentences and drops unsupported ones", () => {
    const extraction = baseExtraction();
    extraction.summary =
      "Engineer focused on reliability. Winner of the Turing Award for systems research.";
    const { extraction: grounded, warnings } = verifyExtractionGrounded(extraction, SOURCE);
    expect(grounded.summary).toBe("Engineer focused on reliability.");
    expect(warnings.some((w) => w.section === "summary" && w.value.includes("Turing"))).toBe(true);
  });
});
