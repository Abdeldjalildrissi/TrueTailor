import { beforeEach, describe, expect, it } from "vitest";
import { setProviderForTesting } from "@/lib/ai";
import { AIProviderError } from "@/lib/ai/types";
import type { Extraction } from "@/lib/profile/extraction";
import type { Profile } from "@/lib/profile/schema";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { GET as profileGet, PUT as profilePut } from "@/app/api/profile/route";
import { POST as importPost } from "@/app/api/resume/import/route";
import { FailingProvider, FakeProvider } from "../helpers/fake-provider";

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

/** Canned extraction: everything real from the document PLUS three fabrications. */
const cannedExtraction: Extraction = {
  basics: {
    fullName: "Jane Smith",
    headline: "Senior Software Engineer",
    email: "jane.smith@example.com",
    phone: null,
    location: "San Francisco, CA",
    links: []
  },
  summary: "Engineer with a decade of experience building distributed systems.",
  experience: [
    {
      employer: "Acme Corp",
      title: "Senior Software Engineer",
      location: null,
      startDate: "2019-03",
      endDate: null,
      isCurrent: true,
      bullets: [
        "Led migration of the billing platform to event-driven architecture serving 2 million users",
        "Reduced infrastructure costs 35% by rightsizing Kubernetes clusters"
      ]
    },
    {
      employer: "Initech",
      title: "Software Engineer",
      location: null,
      startDate: "2015",
      endDate: "2019",
      isCurrent: null,
      bullets: ["Built internal reporting tools in Python and React"]
    },
    {
      employer: "Globex Corporation", // fabricated — not in the document
      title: "VP of Engineering",
      location: null,
      startDate: "2012",
      endDate: "2015",
      isCurrent: null,
      bullets: ["Ran a 200-person org"]
    }
  ],
  education: [
    {
      institution: "State University",
      degree: "BS",
      field: "Computer Science",
      startDate: "2011",
      endDate: "2015",
      details: []
    }
  ],
  skills: [
    { name: "Python", category: null },
    { name: "TypeScript", category: null },
    { name: "Kubernetes", category: null },
    { name: "PostgreSQL", category: null },
    { name: "Blockchain", category: null } // fabricated
  ],
  certifications: [
    { name: "AWS Solutions Architect", issuer: "Amazon", date: "2020" } // fabricated
  ],
  projects: [],
  awards: [],
  languages: []
};

async function registerAndGetCookie(): Promise<string> {
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
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = /tt_session=([^;]+)/.exec(setCookie);
  if (!match) {
    throw new Error("registration did not set a session cookie");
  }
  return `tt_session=${match[1]}`;
}

function importPasteRequest(cookie: string, text: string): Request {
  return new Request(`${BASE}/api/resume/import`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ text })
  });
}

interface ImportPayload {
  profile: Profile;
  warnings: { section: string; value: string }[];
  version: number;
  error?: string;
}

describe("resume import and profile lifecycle", () => {
  beforeEach(() => {
    setProviderForTesting(new FakeProvider(() => cannedExtraction));
  });

  it("requires authentication", async () => {
    const res = await importPost(importPasteRequest("tt_session=nope", RESUME_TEXT));
    expect(res.status).toBe(401);
  });

  it("imports pasted text, strips fabrications, and persists a versioned profile", async () => {
    const cookie = await registerAndGetCookie();
    const res = await importPost(importPasteRequest(cookie, RESUME_TEXT));
    expect(res.status).toBe(201);
    const payload = (await res.json()) as ImportPayload;

    // Real entries survived.
    expect(payload.profile.experience.map((e) => e.employer)).toEqual(["Acme Corp", "Initech"]);
    expect(payload.profile.skills.map((s) => s.name)).toEqual([
      "Python",
      "TypeScript",
      "Kubernetes",
      "PostgreSQL"
    ]);
    expect(payload.profile.education[0]?.institution).toBe("State University");
    expect(payload.profile.basics.email).toBe("jane.smith@example.com");

    // Fabrications were structurally removed and reported.
    expect(payload.profile.certifications).toHaveLength(0);
    expect(payload.warnings.some((w) => w.value.includes("Globex"))).toBe(true);
    expect(payload.warnings.some((w) => w.value.includes("Blockchain"))).toBe(true);
    expect(payload.warnings.some((w) => w.value.includes("AWS Solutions Architect"))).toBe(true);

    // Every entry received a stable unique id.
    const ids = [
      ...payload.profile.experience.map((e) => e.id),
      ...payload.profile.experience.flatMap((e) => e.bullets.map((b) => b.id)),
      ...payload.profile.skills.map((s) => s.id),
      ...payload.profile.education.map((e) => e.id)
    ];
    expect(ids.every((id) => typeof id === "string" && id.length >= 6)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);

    expect(payload.version).toBe(1);
  });

  it("imports via multipart file upload", async () => {
    const cookie = await registerAndGetCookie();
    const form = new FormData();
    form.append("file", new File([RESUME_TEXT], "resume.txt", { type: "text/plain" }));
    const res = await importPost(
      new Request(`${BASE}/api/resume/import`, { method: "POST", headers: { cookie }, body: form })
    );
    expect(res.status).toBe(201);
    const payload = (await res.json()) as ImportPayload;
    expect(payload.profile.experience).toHaveLength(2);
  });

  it("rejects unsupported file types", async () => {
    const cookie = await registerAndGetCookie();
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1, 2, 3, 4])], "resume.xyz"));
    const res = await importPost(
      new Request(`${BASE}/api/resume/import`, { method: "POST", headers: { cookie }, body: form })
    );
    expect(res.status).toBe(400);
  });

  it("maps provider failures to 502 without crashing", async () => {
    setProviderForTesting(new FailingProvider(new AIProviderError("provider unavailable")));
    const cookie = await registerAndGetCookie();
    const res = await importPost(importPasteRequest(cookie, RESUME_TEXT));
    expect(res.status).toBe(502);
  });

  it("GET returns the stored profile; PUT edits bump the version and keep unchanged bullet ids", async () => {
    const cookie = await registerAndGetCookie();
    const imported = (await (
      await importPost(importPasteRequest(cookie, RESUME_TEXT))
    ).json()) as ImportPayload;

    const got = await profileGet(new Request(`${BASE}/api/profile`, { headers: { cookie } }));
    expect(got.status).toBe(200);
    const stored = (await got.json()) as ImportPayload;
    expect(stored.version).toBe(1);
    expect(stored.profile.experience).toHaveLength(2);

    // Edit: user corrects their title at Acme; everything else unchanged.
    const edited = JSON.parse(JSON.stringify(stored.profile)) as Profile;
    const acme = edited.experience[0];
    if (!acme) {
      throw new Error("expected Acme entry");
    }
    acme.title = "Staff Software Engineer";

    const put = await profilePut(
      new Request(`${BASE}/api/profile`, {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(edited)
      })
    );
    expect(put.status).toBe(200);
    const updated = (await put.json()) as ImportPayload;
    expect(updated.version).toBe(2);
    expect(updated.profile.experience[0]?.title).toBe("Staff Software Engineer");

    // Stable identity: entry and bullet ids survived the edit.
    expect(updated.profile.experience[0]?.id).toBe(imported.profile.experience[0]?.id);
    expect(updated.profile.experience[0]?.bullets.map((b) => b.id)).toEqual(
      imported.profile.experience[0]?.bullets.map((b) => b.id)
    );
  });

  it("PUT rejects rule violations with actionable details", async () => {
    const cookie = await registerAndGetCookie();
    const imported = (await (
      await importPost(importPasteRequest(cookie, RESUME_TEXT))
    ).json()) as ImportPayload;

    const edited = JSON.parse(JSON.stringify(imported.profile)) as Profile;
    const initech = edited.experience[1];
    if (!initech) {
      throw new Error("expected Initech entry");
    }
    initech.startDate = "2020";
    initech.endDate = "2019";

    const put = await profilePut(
      new Request(`${BASE}/api/profile`, {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(edited)
      })
    );
    expect(put.status).toBe(400);
    const body = (await put.json()) as { details?: { message: string }[] };
    expect(body.details?.some((d) => d.message.includes("after end date"))).toBe(true);
  });
});
