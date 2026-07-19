import { describe, expect, it } from "vitest";
import { setProviderForTesting } from "@/lib/ai";
import type { AIProvider, StructuredRequest } from "@/lib/ai/types";
import type { Profile } from "@/lib/profile/schema";
import type { TailoredResume } from "@/lib/tailor/generate";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { PUT as profilePut } from "@/app/api/profile/route";
import { POST as tailorPost } from "@/app/api/tailor/route";
import { PUT as decisionsPut } from "@/app/api/tailorings/[id]/decisions/route";

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

const GENERATED_BULLET_0 = "Moved billing onto Kubernetes, serving 2 million users";
const GENERATED_BULLET_1 = "Cut infrastructure costs 35% through capacity planning";

/** Captures every generation prompt so learning injection can be asserted. */
class CapturingFake implements AIProvider {
  readonly name = "anthropic" as const;
  public generationPrompts: string[] = [];

  async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
    if (request.schemaName === "job_analysis") {
      return request.schema.parse({
        roleTitle: "Senior Platform Engineer",
        company: "Globex Industries",
        requirements: [{ text: "Kubernetes in production", kind: "must", keywords: ["Kubernetes"] }]
      });
    }
    this.generationPrompts.push(request.user);
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
            { text: GENERATED_BULLET_0, sourceIds: [b1?.id ?? ""] },
            { text: GENERATED_BULLET_1, sourceIds: [b2?.id ?? ""] }
          ]
        }
      ],
      skillIds: profile.skills.map((s) => s.id),
      coverLetter: null
    };
    return request.schema.parse(generated);
  }
}

describe("learning flow: review history shapes future prompting", () => {
  it("injects edit pairs and rejections into the next generation prompt", async () => {
    const fake = new CapturingFake();
    setProviderForTesting(fake);

    // Register + profile
    const reg = await registerPost(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "learner@example.com",
          password: "history should teach style",
          displayName: "Learner"
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

    // Tailoring #1 — no history yet, so no preferences block in the prompt.
    const first = await tailorPost(
      new Request(`${BASE}/api/tailor`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ jobText: JOB_TEXT, coverLetter: false })
      })
    );
    expect(first.status).toBe(201);
    const firstPayload = (await first.json()) as { id: string };
    expect(fake.generationPrompts[0]).not.toContain("<user_preferences>");

    // The user reviews: rejects one line, rewrites the other.
    const saved = await decisionsPut(
      new Request(`${BASE}/api/tailorings/${firstPayload.id}/decisions`, {
        method: "PUT",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          decisions: [
            { claimPath: "experience[0].bullets[0]", action: "reject" },
            {
              claimPath: "experience[0].bullets[1]",
              action: "edit",
              editedText: "Cut infra costs 35% with capacity planning"
            }
          ]
        })
      }),
      { params: Promise.resolve({ id: firstPayload.id }) }
    );
    expect(saved.status).toBe(200);

    // Tailoring #2 — history must now flow into the generation prompt.
    const second = await tailorPost(
      new Request(`${BASE}/api/tailor`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ jobText: JOB_TEXT, coverLetter: false })
      })
    );
    expect(second.status).toBe(201);

    const prompt = fake.generationPrompts[1] ?? "";
    expect(prompt).toContain("<user_preferences>");
    expect(prompt).toContain("always take precedence");
    // The rewrite pair: generated original → user's version.
    expect(prompt).toContain(GENERATED_BULLET_1);
    expect(prompt).toContain("Cut infra costs 35% with capacity planning");
    // The rejected line is quoted as a negative example.
    expect(prompt).toContain(GENERATED_BULLET_0);
    // Learning must come AFTER the gap rules, never replacing them.
    expect(prompt.indexOf("<gaps_do_not_cover>")).toBeLessThan(
      prompt.indexOf("<user_preferences>")
    );
  });
});
