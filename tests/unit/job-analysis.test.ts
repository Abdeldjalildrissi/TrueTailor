import { describe, expect, it } from "vitest";
import { groundJobAnalysis, type JobAnalysis } from "@/lib/tailor/job-analysis";

const JOB_TEXT = `Senior Platform Engineer — Globex Industries

Requirements:
- 5+ years building distributed systems
- Kubernetes in production
- Strong Python skills

Nice to have:
- Rust experience`;

let counter = 0;
const makeId = () => `req-${(counter += 1)}`;

describe("groundJobAnalysis", () => {
  it("keeps verbatim requirements and drops fabricated ones with warnings", () => {
    const analysis: JobAnalysis = {
      roleTitle: "Senior Platform Engineer",
      company: "Globex Industries",
      requirements: [
        {
          text: "5+ years building distributed systems",
          kind: "must",
          keywords: ["distributed systems", "5+ years"]
        },
        { text: "Kubernetes in production", kind: "must", keywords: ["Kubernetes"] },
        { text: "Rust experience", kind: "nice", keywords: ["Rust"] },
        { text: "Must hold a PhD in Computer Science", kind: "must", keywords: ["PhD"] }
      ]
    };
    const grounded = groundJobAnalysis(analysis, JOB_TEXT, makeId);

    expect(grounded.roleTitle).toBe("Senior Platform Engineer");
    expect(grounded.company).toBe("Globex Industries");
    expect(grounded.requirements.map((r) => r.text)).toEqual([
      "5+ years building distributed systems",
      "Kubernetes in production",
      "Rust experience"
    ]);
    expect(grounded.warnings.some((w) => w.value.includes("PhD"))).toBe(true);
  });

  it("drops keywords that are not in the posting but keeps the requirement", () => {
    const analysis: JobAnalysis = {
      roleTitle: null,
      company: null,
      requirements: [{ text: "Strong Python skills", kind: "must", keywords: ["Python", "Django"] }]
    };
    const grounded = groundJobAnalysis(analysis, JOB_TEXT, makeId);
    expect(grounded.requirements[0]?.keywords).toEqual(["Python"]);
    expect(grounded.warnings.some((w) => w.value === "Django")).toBe(true);
  });

  it("nulls role and company when not stated verbatim", () => {
    const analysis: JobAnalysis = {
      roleTitle: "Chief Wizard",
      company: "Hogwarts",
      requirements: [{ text: "Kubernetes in production", kind: null, keywords: ["Kubernetes"] }]
    };
    const grounded = groundJobAnalysis(analysis, JOB_TEXT, makeId);
    expect(grounded.roleTitle).toBeNull();
    expect(grounded.company).toBeNull();
    expect(grounded.requirements[0]?.kind).toBe("must"); // null defaults to must
  });

  it("dedupes repeated requirement quotes", () => {
    const analysis: JobAnalysis = {
      roleTitle: null,
      company: null,
      requirements: [
        { text: "Kubernetes in production", kind: "must", keywords: ["Kubernetes"] },
        { text: "Kubernetes in production", kind: "must", keywords: ["Kubernetes"] }
      ]
    };
    const grounded = groundJobAnalysis(analysis, JOB_TEXT, makeId);
    expect(grounded.requirements).toHaveLength(1);
  });
});

describe("groundJobAnalysis: keyword fallback (D-0028)", () => {
  it("falls back to the verbatim requirement text when the model returns no keywords", () => {
    const analysis: JobAnalysis = {
      roleTitle: null,
      company: null,
      requirements: [{ text: "Kubernetes in production", kind: "must", keywords: [] }]
    };
    const grounded = groundJobAnalysis(analysis, JOB_TEXT, makeId);
    expect(grounded.requirements).toHaveLength(1);
    expect(grounded.requirements[0]?.keywords).toEqual(["Kubernetes in production"]);
  });

  it("falls back to the requirement text when no keyword grounds in the posting", () => {
    const analysis: JobAnalysis = {
      roleTitle: null,
      company: null,
      requirements: [{ text: "Strong Python skills", kind: "must", keywords: ["Golang", "Scala"] }]
    };
    const grounded = groundJobAnalysis(analysis, JOB_TEXT, makeId);
    expect(grounded.requirements).toHaveLength(1);
    expect(grounded.requirements[0]?.keywords).toEqual(["Strong Python skills"]);
    // The fabricated keywords are still individually warned about.
    expect(grounded.warnings.map((w) => w.value)).toEqual(
      expect.arrayContaining(["Golang", "Scala"])
    );
  });

  it("still drops a requirement whose text is not verbatim in the posting", () => {
    const analysis: JobAnalysis = {
      roleTitle: null,
      company: null,
      requirements: [{ text: "Must be a wizard", kind: "must", keywords: [] }]
    };
    const grounded = groundJobAnalysis(analysis, JOB_TEXT, makeId);
    expect(grounded.requirements).toHaveLength(0);
  });
});
