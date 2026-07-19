import { describe, expect, it } from "vitest";
import { squash } from "@/lib/profile/text";
import type { Profile } from "@/lib/profile/schema";
import type { GroundingWarning } from "@/lib/profile/grounding";
import type { TailoredResume } from "@/lib/tailor/generate";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { POST as importPost } from "@/app/api/resume/import/route";
import { POST as tailorPost } from "@/app/api/tailor/route";

/**
 * LIVE end-to-end verification against the real provider configured in the
 * environment (AI_PROVIDER + its API key). Model output is nondeterministic,
 * so these tests assert the system's INVARIANTS — the guarantees that must
 * hold for any model output — rather than exact content:
 *
 *   1. Everything extracted into the profile literally appears in the source
 *      document (the grounding gate held).
 *   2. Every requirement quote appears in the job posting.
 *   3. Every tailored entry references real profile ids, and the
 *      verification report accounts for every generated line.
 */

const BASE = "http://localhost:3000";

const RESUME_TEXT = `Jane Smith
Senior Software Engineer
jane.smith@example.com | San Francisco, CA

SUMMARY
Engineer with a decade of experience building distributed systems.

EXPERIENCE
Acme Corp - Senior Software Engineer
2019-03 to Present
- Led migration of the billing platform to event-driven architecture serving 2 million users
- Reduced infrastructure costs 35% by rightsizing Kubernetes clusters

Initech - Software Engineer
2015 to 2019
- Built internal reporting tools in Python and React

EDUCATION
State University - BS, Computer Science, 2011 to 2015

SKILLS
Python, TypeScript, Kubernetes, PostgreSQL`;

const JOB_TEXT = `Senior Platform Engineer — Globex Industries

We are hiring a Senior Platform Engineer to scale our infrastructure.

Requirements:
- Kubernetes in production
- Experience reducing infrastructure costs
- Strong Python skills
- Rust experience is a plus`;

function supportedBy(haystack: string, needle: string): boolean {
  return squash(haystack).includes(squash(needle));
}

describe("live provider end-to-end", () => {
  it("imports a real resume and tailors it with every invariant holding", async () => {
    // Register
    const reg = await registerPost(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "live-check@example.com",
          password: "grounded generation only",
          displayName: "Live Check"
        })
      })
    );
    expect(reg.status).toBe(201);
    const cookie = `tt_session=${/tt_session=([^;]+)/.exec(reg.headers.get("set-cookie") ?? "")?.[1]}`;

    // LIVE import: real structured extraction
    const importRes = await importPost(
      new Request(`${BASE}/api/resume/import`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ text: RESUME_TEXT })
      })
    );
    expect(importRes.status).toBe(201);
    const imported = (await importRes.json()) as {
      profile: Profile;
      warnings: GroundingWarning[];
      version: number;
    };

    // Invariant 1: the grounding gate held — every substantive profile string
    // appears in the source document.
    expect(imported.profile.experience.length).toBeGreaterThanOrEqual(1);
    for (const role of imported.profile.experience) {
      expect(supportedBy(RESUME_TEXT, role.employer)).toBe(true);
      expect(supportedBy(RESUME_TEXT, role.title)).toBe(true);
      for (const bullet of role.bullets) {
        expect(supportedBy(RESUME_TEXT, bullet.text)).toBe(true);
      }
    }
    expect(imported.profile.skills.length).toBeGreaterThanOrEqual(1);
    for (const skill of imported.profile.skills) {
      expect(supportedBy(RESUME_TEXT, skill.name)).toBe(true);
    }
    for (const education of imported.profile.education) {
      expect(supportedBy(RESUME_TEXT, education.institution)).toBe(true);
    }

    // LIVE tailoring: real analysis + real grounded generation + verifier
    const tailorRes = await tailorPost(
      new Request(`${BASE}/api/tailor`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ jobText: JOB_TEXT, coverLetter: false })
      })
    );
    expect(tailorRes.status).toBe(201);
    const tailored = (await tailorRes.json()) as {
      analysis: { requirements: { text: string }[]; warnings: { value: string }[] };
      ranking: { requirementMatches: { strength: string }[]; gaps: { requirementText: string }[] };
      result: TailoredResume;
      verification: {
        valid: boolean;
        unsupportedCount: number;
        claims: { status: string; path: string }[];
      };
      profile: Profile;
    };

    // Invariant 2: every requirement quote appears in the posting.
    expect(tailored.analysis.requirements.length).toBeGreaterThanOrEqual(1);
    for (const requirement of tailored.analysis.requirements) {
      expect(supportedBy(JOB_TEXT, requirement.text)).toBe(true);
    }

    // Invariant 3: structural integrity of the generated result.
    const profileExperienceIds = new Set(tailored.profile.experience.map((e) => e.id));
    const profileSkillIds = new Set(tailored.profile.skills.map((s) => s.id));
    for (const entry of tailored.result.experience) {
      expect(profileExperienceIds.has(entry.experienceId)).toBe(true);
      for (const bullet of entry.bullets) {
        expect(bullet.sourceIds.length).toBeGreaterThanOrEqual(1);
      }
    }
    for (const skillId of tailored.result.skillIds) {
      expect(profileSkillIds.has(skillId)).toBe(true);
    }

    // The verifier accounted for every prose line, and its verdict is coherent.
    const proseLines =
      tailored.result.experience.reduce((n, e) => n + e.bullets.length, 0) +
      (tailored.result.summary ? 1 : 0);
    expect(tailored.verification.claims.length).toBeGreaterThanOrEqual(proseLines);
    const unsupported = tailored.verification.claims.filter((c) => c.status === "unsupported");
    expect(tailored.verification.unsupportedCount).toBe(unsupported.length);
    expect(tailored.verification.valid).toBe(unsupported.length === 0);

    // Human-readable evidence for the decision log.
    console.log(
      JSON.stringify(
        {
          provider: process.env.AI_PROVIDER,
          importedRoles: imported.profile.experience.length,
          importedSkills: imported.profile.skills.length,
          importExclusions: imported.warnings.length,
          requirementsFound: tailored.analysis.requirements.length,
          coverage: tailored.ranking.requirementMatches.map((m) => m.strength),
          gaps: tailored.ranking.gaps.map((g) => g.requirementText),
          generatedLines: tailored.verification.claims.length,
          blockedLines: tailored.verification.unsupportedCount,
          verdict: tailored.verification.valid ? "all lines verified" : "blocked lines flagged"
        },
        null,
        2
      )
    );
  });
});
