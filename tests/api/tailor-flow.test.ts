import { describe, expect, it } from "vitest";
import { setProviderForTesting } from "@/lib/ai";
import type { StructuredRequest } from "@/lib/ai/types";
import type { AIProvider } from "@/lib/ai/types";
import type { Profile } from "@/lib/profile/schema";
import type { TailoredResume } from "@/lib/tailor/generate";
import type { JobAnalysis } from "@/lib/tailor/job-analysis";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { PUT as profilePut } from "@/app/api/profile/route";
import { POST as tailorPost } from "@/app/api/tailor/route";
import { GET as tailoringsGet } from "@/app/api/tailorings/route";
import { GET as tailoringGet } from "@/app/api/tailorings/[id]/route";

const BASE = "http://localhost:3000";

const JOB_TEXT = `Senior Platform Engineer — Globex Industries

We are hiring a Senior Platform Engineer to scale our infrastructure.

Requirements:
- Kubernetes in production
- Experience reducing infrastructure costs
- Rust experience is a plus`;

const PROFILE_INPUT = {
  basics: {
    fullName: "Jane Smith",
    headline: null,
    email: "jane@example.com",
    phone: null,
    location: null,
    links: []
  },
  summary: null,
  experience: [
    {
      employer: "Acme Corp",
      title: "Senior Software Engineer",
      location: null,
      startDate: "2019",
      endDate: null,
      isCurrent: true,
      bullets: [
        { text: "Migrated billing services to Kubernetes serving 2 million users" },
        { text: "Cut infrastructure costs 35% through capacity planning" }
      ]
    }
  ],
  education: [],
  skills: [
    { name: "Kubernetes", category: null },
    { name: "Python", category: null }
  ],
  certifications: [],
  projects: [],
  awards: [],
  languages: []
};

const cannedAnalysis: JobAnalysis = {
  roleTitle: "Senior Platform Engineer",
  company: "Globex Industries",
  requirements: [
    { text: "Kubernetes in production", kind: "must", keywords: ["Kubernetes"] },
    {
      text: "Experience reducing infrastructure costs",
      kind: "must",
      keywords: ["infrastructure costs"]
    },
    { text: "Rust experience is a plus", kind: "nice", keywords: ["Rust"] },
    { text: "Requires a top-secret clearance", kind: "must", keywords: ["clearance"] } // fabricated
  ]
};

/** Dispatching fake: analysis for stage 1; generation (built from the real
 *  profile ids embedded in the prompt) for stage 2. */
class TailorFake implements AIProvider {
  readonly name = "anthropic" as const;

  constructor(private readonly generate: (profile: Profile) => TailoredResume) {}

  async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
    if (request.schemaName === "job_analysis") {
      return request.schema.parse(cannedAnalysis);
    }
    const profileJson = /<profile>\n([\s\S]*?)\n<\/profile>/.exec(request.user)?.[1];
    if (!profileJson) {
      throw new Error("prompt did not include a profile block");
    }
    const profile = JSON.parse(profileJson) as Profile;
    return request.schema.parse(this.generate(profile));
  }
}

function faithfulGeneration(profile: Profile): TailoredResume {
  const role = profile.experience[0];
  if (!role) {
    throw new Error("profile fixture requires a role");
  }
  const [k8sBullet, costBullet] = role.bullets;
  return {
    summary: {
      text: "Engineer who moved billing to Kubernetes for 2 million users and cut infrastructure costs 35%.",
      sourceIds: [k8sBullet?.id ?? "", costBullet?.id ?? ""].filter(Boolean)
    },
    experience: [
      {
        experienceId: role.id,
        bullets: [
          {
            text: "Moved billing services onto Kubernetes, serving 2 million users",
            sourceIds: [k8sBullet?.id ?? ""].filter(Boolean)
          },
          {
            text: "Cut infrastructure costs 35% through capacity planning",
            sourceIds: [costBullet?.id ?? ""].filter(Boolean)
          }
        ]
      }
    ],
    skillIds: profile.skills.filter((s) => s.name === "Kubernetes").map((s) => s.id),
    coverLetter: null
  };
}

function fabricatingGeneration(profile: Profile): TailoredResume {
  const base = faithfulGeneration(profile);
  const role = profile.experience[0];
  const k8sBullet = role?.bullets[0];
  base.experience[0]?.bullets.push({
    text: "Scaled the platform to 90 million users on Google Cloud Platform",
    sourceIds: [k8sBullet?.id ?? ""].filter(Boolean)
  });
  return base;
}

async function setupUserWithProfile(): Promise<string> {
  const res = await registerPost(
    new Request(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "jane@example.com",
        password: "distributed systems rule",
        displayName: "Jane Smith"
      })
    })
  );
  const match = /tt_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "");
  const cookie = `tt_session=${match?.[1] ?? ""}`;
  const put = await profilePut(
    new Request(`${BASE}/api/profile`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(PROFILE_INPUT)
    })
  );
  if (put.status !== 200) {
    throw new Error("profile setup failed");
  }
  return cookie;
}

function tailorRequest(cookie: string): Request {
  return new Request(`${BASE}/api/tailor`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ jobText: JOB_TEXT, coverLetter: false })
  });
}

interface TailorPayload {
  id: string;
  analysis: { requirements: { text: string }[]; warnings: { value: string }[] };
  ranking: {
    requirementMatches: { requirementText: string; strength: string }[];
    gaps: { requirementText: string; strength: string }[];
  };
  result: TailoredResume;
  verification: {
    valid: boolean;
    unsupportedCount: number;
    claims: { status: string; problems: string[] }[];
  };
}

describe("tailoring flow", () => {
  it("requires authentication", async () => {
    setProviderForTesting(new TailorFake(faithfulGeneration));
    const res = await tailorPost(
      new Request(`${BASE}/api/tailor`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobText: JOB_TEXT })
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 409 when no profile exists", async () => {
    setProviderForTesting(new TailorFake(faithfulGeneration));
    const reg = await registerPost(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "empty@example.com",
          password: "no profile here yet",
          displayName: "Empty"
        })
      })
    );
    const cookie = `tt_session=${/tt_session=([^;]+)/.exec(reg.headers.get("set-cookie") ?? "")?.[1]}`;
    const res = await tailorPost(tailorRequest(cookie));
    expect(res.status).toBe(409);
  });

  it("tailors faithfully: grounded analysis, honest gaps, verified claims", async () => {
    setProviderForTesting(new TailorFake(faithfulGeneration));
    const cookie = await setupUserWithProfile();
    const res = await tailorPost(tailorRequest(cookie));
    expect(res.status).toBe(201);
    const payload = (await res.json()) as TailorPayload;

    // Fabricated requirement ("clearance") was dropped by JD grounding.
    expect(payload.analysis.requirements.map((r) => r.text)).toEqual([
      "Kubernetes in production",
      "Experience reducing infrastructure costs",
      "Rust experience is a plus"
    ]);
    expect(payload.analysis.warnings.some((w) => w.value.includes("clearance"))).toBe(true);

    // Coverage: Kubernetes full (skill), costs matched, Rust an explicit gap.
    const byText = new Map(
      payload.ranking.requirementMatches.map((m) => [m.requirementText, m.strength])
    );
    expect(byText.get("Kubernetes in production")).toBe("full");
    expect(byText.get("Rust experience is a plus")).toBe("none");
    expect(payload.ranking.gaps.some((g) => g.requirementText.includes("Rust"))).toBe(true);

    // Every generated line verified.
    expect(payload.verification.valid).toBe(true);
    expect(payload.verification.unsupportedCount).toBe(0);
    expect(payload.result.experience[0]?.bullets.length).toBe(2);
  });

  it("blocks fabricated lines while keeping the rest usable", async () => {
    setProviderForTesting(new TailorFake(fabricatingGeneration));
    const cookie = await setupUserWithProfile();
    const res = await tailorPost(tailorRequest(cookie));
    expect(res.status).toBe(201);
    const payload = (await res.json()) as TailorPayload;

    expect(payload.verification.valid).toBe(false);
    expect(payload.verification.unsupportedCount).toBe(1);
    const blocked = payload.verification.claims.find((c) => c.status === "unsupported");
    expect(blocked?.problems.some((p) => p.includes('"90"'))).toBe(true);
    expect(blocked?.problems.some((p) => p.includes("Google Cloud Platform"))).toBe(true);
  });

  it("lists and retrieves stored tailorings", async () => {
    setProviderForTesting(new TailorFake(faithfulGeneration));
    const cookie = await setupUserWithProfile();
    const created = (await (await tailorPost(tailorRequest(cookie))).json()) as TailorPayload;

    const list = await tailoringsGet(
      new Request(`${BASE}/api/tailorings`, { headers: { cookie } })
    );
    expect(list.status).toBe(200);
    const listPayload = (await list.json()) as { tailorings: { id: string; valid: boolean }[] };
    expect(listPayload.tailorings).toHaveLength(1);
    expect(listPayload.tailorings[0]?.id).toBe(created.id);

    const detail = await tailoringGet(
      new Request(`${BASE}/api/tailorings/${created.id}`, { headers: { cookie } }),
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(detail.status).toBe(200);

    const missing = await tailoringGet(
      new Request(`${BASE}/api/tailorings/nope`, { headers: { cookie } }),
      { params: Promise.resolve({ id: "nope" }) }
    );
    expect(missing.status).toBe(404);
  });
});
