import { describe, expect, it } from "vitest";
import { setProviderForTesting } from "@/lib/ai";
import type { AIProvider, StructuredRequest } from "@/lib/ai/types";
import type { Profile } from "@/lib/profile/schema";
import type { TailoredResume } from "@/lib/tailor/generate";
import { POST as registerPost } from "@/app/api/auth/register/route";
import {
  DELETE as photoDelete,
  GET as photoGet,
  POST as photoPost
} from "@/app/api/profile/photo/route";
import { PUT as profilePut } from "@/app/api/profile/route";
import { POST as tailorPost } from "@/app/api/tailor/route";
import { GET as exportGet } from "@/app/api/tailorings/[id]/export/route";

const BASE = "http://localhost:3000";

// Smallest valid JPEG/PNG magic-byte payloads (sniffing only checks headers).
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

const JOB_TEXT = `Senior Platform Engineer — Globex Industries

Requirements:
- Kubernetes in production`;

const PROFILE_INPUT = {
  basics: {
    fullName: "Photo Tester",
    headline: null,
    email: "photo@example.com",
    phone: null,
    location: null,
    links: []
  },
  summary: null,
  experience: [
    {
      employer: "Acme Corp",
      title: "Engineer",
      location: null,
      startDate: "2019",
      endDate: null,
      isCurrent: true,
      bullets: [{ text: "Migrated billing services to Kubernetes serving 2 million users" }]
    }
  ],
  education: [],
  skills: [{ name: "Kubernetes", category: null }],
  certifications: [],
  projects: [],
  awards: [],
  languages: []
};

class Fake implements AIProvider {
  readonly name = "anthropic" as const;
  async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
    if (request.schemaName === "job_analysis") {
      return request.schema.parse({
        roleTitle: null,
        company: null,
        requirements: [{ text: "Kubernetes in production", kind: "must", keywords: ["Kubernetes"] }]
      });
    }
    const profileJson = /<profile>\n([\s\S]*?)\n<\/profile>/.exec(request.user)?.[1];
    const profile = JSON.parse(profileJson ?? "{}") as Profile;
    const role = profile.experience[0];
    const bullet = role?.bullets[0];
    const generated: TailoredResume = {
      summary: null,
      experience: [
        {
          experienceId: role?.id ?? "",
          bullets: [
            {
              text: "Migrated billing services to Kubernetes serving 2 million users",
              sourceIds: [bullet?.id ?? ""]
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

async function registerAndProfile(): Promise<string> {
  const reg = await registerPost(
    new Request(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "photo@example.com",
        password: "pictures belong to people",
        displayName: "Photo Tester"
      })
    })
  );
  expect(reg.status).toBe(201);
  const cookie = `tt_session=${/tt_session=([^;]+)/.exec(reg.headers.get("set-cookie") ?? "")?.[1]}`;
  const saved = await profilePut(
    new Request(`${BASE}/api/profile`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(PROFILE_INPUT)
    })
  );
  expect(saved.status).toBe(200);
  return cookie;
}

function photoForm(bytes: Uint8Array, type: string, name: string): FormData {
  const form = new FormData();
  // .slice() re-backs the view with a fresh ArrayBuffer, which BlobPart requires.
  form.append("photo", new File([bytes.slice().buffer], name, { type }));
  return form;
}

describe("profile photo flow and LaTeX export packaging", () => {
  it("uploads, serves, packages into LaTeX zip, and removes cleanly", async () => {
    setProviderForTesting(new Fake());
    const cookie = await registerAndProfile();

    // No photo yet.
    const missing = await photoGet(
      new Request(`${BASE}/api/profile/photo`, { headers: { cookie } })
    );
    expect(missing.status).toBe(404);

    // A text file dressed as an image is rejected by magic-byte sniffing.
    const fake = await photoPost(
      new Request(`${BASE}/api/profile/photo`, {
        method: "POST",
        headers: { cookie },
        body: photoForm(new TextEncoder().encode("not an image"), "image/jpeg", "fake.jpg")
      })
    );
    expect(fake.status).toBe(415);

    // A real JPEG uploads.
    const uploaded = await photoPost(
      new Request(`${BASE}/api/profile/photo`, {
        method: "POST",
        headers: { cookie },
        body: photoForm(JPEG_BYTES, "image/jpeg", "me.jpg")
      })
    );
    expect(uploaded.status).toBe(200);
    expect(((await uploaded.json()) as { mime: string }).mime).toBe("image/jpeg");

    // It serves back with the sniffed content type.
    const served = await photoGet(
      new Request(`${BASE}/api/profile/photo`, { headers: { cookie } })
    );
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/jpeg");

    // Replacing with a PNG works (single slot per user).
    const replaced = await photoPost(
      new Request(`${BASE}/api/profile/photo`, {
        method: "POST",
        headers: { cookie },
        body: photoForm(PNG_BYTES, "image/png", "me.png")
      })
    );
    expect(replaced.status).toBe(200);

    // Tailor, then export LaTeX: with a photo it ships as a zip.
    const tailored = await tailorPost(
      new Request(`${BASE}/api/tailor`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ jobText: JOB_TEXT, coverLetter: false })
      })
    );
    expect(tailored.status).toBe(201);
    const { id } = (await tailored.json()) as { id: string };

    const zipped = await exportGet(
      new Request(`${BASE}/api/tailorings/${id}/export?format=latex&doc=resume`, {
        headers: { cookie }
      }),
      { params: Promise.resolve({ id }) }
    );
    expect(zipped.status).toBe(200);
    expect(zipped.headers.get("content-type")).toBe("application/zip");

    // Remove the photo → the same export is a bare .tex without a photo block.
    const removed = await photoDelete(
      new Request(`${BASE}/api/profile/photo`, { method: "DELETE", headers: { cookie } })
    );
    expect(removed.status).toBe(200);

    const texOnly = await exportGet(
      new Request(`${BASE}/api/tailorings/${id}/export?format=latex&doc=resume`, {
        headers: { cookie }
      }),
      { params: Promise.resolve({ id }) }
    );
    expect(texOnly.status).toBe(200);
    expect(texOnly.headers.get("content-type")).toContain("application/x-tex");
    const tex = await texOnly.text();
    expect(tex).toContain("\\documentclass[11pt, a4paper]{article}");
    expect(tex).toContain("Photo Tester");
    expect(tex).not.toContain("\\includegraphics");
  });

  it("rejects unauthenticated photo access", async () => {
    const res = await photoGet(new Request(`${BASE}/api/profile/photo`));
    expect(res.status).toBe(401);
  });
});
