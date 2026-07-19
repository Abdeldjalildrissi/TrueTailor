import { describe, expect, it } from "vitest";
import { setProviderForTesting } from "@/lib/ai";
import type { AIProvider, StructuredRequest } from "@/lib/ai/types";
import type { Profile } from "@/lib/profile/schema";
import type { TailoredResume } from "@/lib/tailor/generate";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { PUT as profilePut } from "@/app/api/profile/route";
import { POST as tailorPost } from "@/app/api/tailor/route";
import { PUT as decisionsPut } from "@/app/api/tailorings/[id]/decisions/route";
import { GET as exportGet } from "@/app/api/tailorings/[id]/export/route";

const BASE = "http://localhost:3000";

const JOB_TEXT = `Senior Platform Engineer — Globex Industries

Requirements:
- Kubernetes in production
- Experience reducing infrastructure costs`;

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
  skills: [{ name: "Kubernetes", category: null }],
  certifications: [],
  projects: [],
  awards: [],
  languages: []
};

/** Fake provider: minimal analysis + generation with one fabricated bullet. */
class ReviewFake implements AIProvider {
  readonly name = "anthropic" as const;

  async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
    if (request.schemaName === "job_analysis") {
      return request.schema.parse({
        roleTitle: "Senior Platform Engineer",
        company: "Globex Industries",
        requirements: [{ text: "Kubernetes in production", kind: "must", keywords: ["Kubernetes"] }]
      });
    }
    const profileJson = /<profile>\n([\s\S]*?)\n<\/profile>/.exec(request.user)?.[1];
    const profile = JSON.parse(profileJson ?? "{}") as Profile;
    const role = profile.experience[0];
    const [b1, b2] = role?.bullets ?? [];
    const generated: TailoredResume = {
      summary: null,
      experience: [
        {
          experienceId: role?.id ?? "",
          bullets: [
            {
              text: "Moved billing onto Kubernetes, serving 2 million users",
              sourceIds: [b1?.id ?? ""]
            },
            {
              text: "Cut infrastructure costs 35% through capacity planning",
              sourceIds: [b2?.id ?? ""]
            },
            {
              text: "Won the Turing Award for infrastructure excellence",
              sourceIds: [b1?.id ?? ""]
            }
          ]
        }
      ],
      skillIds: profile.skills.map((s) => s.id),
      coverLetter: null
    };
    return request.schema.parse(generated);
  }
}

async function setup(): Promise<{ cookie: string; tailoringId: string }> {
  setProviderForTesting(new ReviewFake());
  const reg = await registerPost(
    new Request(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "review@example.com",
        password: "check every line first",
        displayName: "Reviewer"
      })
    })
  );
  const cookie = `tt_session=${/tt_session=([^;]+)/.exec(reg.headers.get("set-cookie") ?? "")?.[1]}`;
  await profilePut(
    new Request(`${BASE}/api/profile`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(PROFILE_INPUT)
    })
  );
  const tailorRes = await tailorPost(
    new Request(`${BASE}/api/tailor`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ jobText: JOB_TEXT, coverLetter: false })
    })
  );
  const payload = (await tailorRes.json()) as { id: string };
  return { cookie, tailoringId: payload.id };
}

function putDecisions(cookie: string, id: string, decisions: unknown): Promise<Response> {
  return decisionsPut(
    new Request(`${BASE}/api/tailorings/${id}/decisions`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ decisions })
    }),
    { params: Promise.resolve({ id }) }
  );
}

function getExport(cookie: string, id: string, query: string): Promise<Response> {
  return exportGet(
    new Request(`${BASE}/api/tailorings/${id}/export?${query}`, { headers: { cookie } }),
    { params: Promise.resolve({ id }) }
  );
}

describe("review and export flow", () => {
  it("requires authentication for decisions and export", async () => {
    const { tailoringId } = await setup();
    const anonDecision = await putDecisions("tt_session=nope", tailoringId, [
      { claimPath: "summary", action: "reject" }
    ]);
    expect(anonDecision.status).toBe(401);
    const anonExport = await getExport("tt_session=nope", tailoringId, "format=pdf");
    expect(anonExport.status).toBe(401);
  });

  it("rejects decisions on unknown paths and unknown tailorings", async () => {
    const { cookie, tailoringId } = await setup();
    const badPath = await putDecisions(cookie, tailoringId, [
      { claimPath: "experience[9].bullets[9]", action: "reject" }
    ]);
    expect(badPath.status).toBe(400);
    const badId = await putDecisions(cookie, "nonexistent", [
      { claimPath: "summary", action: "reject" }
    ]);
    expect(badId.status).toBe(404);
  });

  it("applies decisions and gates the export: blocked excluded, rejected excluded, edits included", async () => {
    const { cookie, tailoringId } = await setup();

    const saved = await putDecisions(cookie, tailoringId, [
      { claimPath: "experience[0].bullets[0]", action: "reject" },
      {
        claimPath: "experience[0].bullets[2]",
        action: "edit",
        editedText: "Contributed to platform reliability work"
      }
    ]);
    expect(saved.status).toBe(200);
    const savedPayload = (await saved.json()) as { decisions: { claimPath: string }[] };
    expect(savedPayload.decisions).toHaveLength(2);

    const md = await getExport(cookie, tailoringId, "format=markdown&doc=resume");
    expect(md.status).toBe(200);
    expect(md.headers.get("content-type")).toContain("text/markdown");
    const markdown = await md.text();

    expect(markdown).not.toContain("Moved billing onto Kubernetes"); // rejected
    expect(markdown).not.toContain("Turing Award"); // blocked by the verifier
    expect(markdown).toContain("Contributed to platform reliability work"); // user edit
    expect(markdown).toContain("Cut infrastructure costs 35%"); // verified + accepted
    expect(markdown).toContain("Jane Smith");
  });

  it("exports valid PDF and DOCX bytes", async () => {
    const { cookie, tailoringId } = await setup();

    const pdf = await getExport(cookie, tailoringId, "format=pdf&doc=resume");
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    const pdfBytes = new Uint8Array(await pdf.arrayBuffer());
    expect(new TextDecoder().decode(pdfBytes.slice(0, 5))).toBe("%PDF-");

    const docx = await getExport(cookie, tailoringId, "format=docx&doc=resume");
    expect(docx.status).toBe(200);
    const docxBytes = new Uint8Array(await docx.arrayBuffer());
    expect(docxBytes[0]).toBe(0x50); // P
    expect(docxBytes[1]).toBe(0x4b); // K — zip container
  });

  it("returns 404 for a cover-letter export when none exists", async () => {
    const { cookie, tailoringId } = await setup();
    const res = await getExport(cookie, tailoringId, "format=pdf&doc=cover");
    expect(res.status).toBe(404);
  });
});
