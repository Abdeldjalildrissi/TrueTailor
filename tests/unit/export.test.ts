import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";
import { assembleCoverLetter, assembleResume, type LineDecision } from "@/lib/export/assemble";
import { renderResumeDocx } from "@/lib/export/docx";
import { renderCoverLetterMarkdown, renderResumeMarkdown } from "@/lib/export/markdown";
import { renderResumePdf } from "@/lib/export/pdf";
import { parseResumeFile } from "@/lib/parse";
import { emptyProfile, materializeProfile, type Profile } from "@/lib/profile/schema";
import { squash } from "@/lib/profile/text";
import type { TailoredResume } from "@/lib/tailor/generate";
import { verifyTailoredResume } from "@/lib/tailor/verify";

const GOOD_BULLET_1 = "Migrated billing services to Kubernetes, serving 2 million users";
const GOOD_BULLET_2 = "Cut infrastructure costs 35% through capacity planning";
const FABRICATED_BULLET = "Scaled the platform to 90 million users on Google Cloud Platform";

function fixtureProfile(): Profile {
  return materializeProfile({
    ...emptyProfile(),
    basics: {
      fullName: "Jane Smith",
      headline: "Senior Software Engineer",
      email: "jane@example.com",
      phone: null,
      location: "San Francisco, CA",
      links: [{ label: "GitHub", url: "https://github.com/janesmith" }]
    },
    experience: [
      {
        employer: "Acme Corp",
        title: "Senior Software Engineer",
        location: null,
        startDate: "2019",
        endDate: null,
        isCurrent: true,
        bullets: [{ text: GOOD_BULLET_1 }, { text: GOOD_BULLET_2 }]
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
      { name: "Kubernetes", category: null },
      { name: "Python", category: null }
    ],
    certifications: [{ name: "CKA Certification", issuer: "CNCF", date: "2021" }],
    languages: [{ name: "English", proficiency: "Native" }]
  });
}

function fixture(): {
  profile: Profile;
  result: TailoredResume;
  verification: ReturnType<typeof verifyTailoredResume>;
} {
  const profile = fixtureProfile();
  const role = profile.experience[0];
  if (!role) {
    throw new Error("fixture requires a role");
  }
  const [b1, b2] = role.bullets;
  const result: TailoredResume = {
    summary: {
      text: "Engineer who served 2 million users and cut infrastructure costs 35%.",
      sourceIds: [b1?.id ?? "", b2?.id ?? ""].filter(Boolean)
    },
    experience: [
      {
        experienceId: role.id,
        bullets: [
          {
            text: "Moved billing onto Kubernetes, serving 2 million users",
            sourceIds: [b1?.id ?? ""]
          },
          { text: GOOD_BULLET_2, sourceIds: [b2?.id ?? ""] },
          { text: FABRICATED_BULLET, sourceIds: [b1?.id ?? ""] } // verifier will block
        ]
      }
    ],
    skillIds: profile.skills.map((s) => s.id),
    coverLetter: [
      { text: "I would love to bring this experience to your team.", sourceIds: [] },
      { text: "At Acme Corp I cut infrastructure costs 35%.", sourceIds: [b2?.id ?? ""] }
    ]
  };
  const verification = verifyTailoredResume(profile, result, "Globex is hiring.");
  return { profile, result, verification };
}

describe("assembleResume — the export gate", () => {
  it("includes verified lines and structurally excludes blocked ones by default", () => {
    const { profile, result, verification } = fixture();
    expect(verification.unsupportedCount).toBe(1);

    const resume = assembleResume({ profile, result, verification, decisions: [] });
    const bullets = resume.experience[0]?.bullets.map((b) => b.text) ?? [];
    expect(bullets).toHaveLength(2);
    expect(bullets.join(" ")).not.toContain("90 million");
    expect(resume.summary?.text).toContain("2 million");
    expect(resume.education[0]?.institution).toBe("State University");
    expect(resume.certifications[0]?.name).toBe("CKA Certification");
  });

  it("honors reject decisions", () => {
    const { profile, result, verification } = fixture();
    const decisions: LineDecision[] = [
      { claimPath: "experience[0].bullets[0]", action: "reject", editedText: null }
    ];
    const resume = assembleResume({ profile, result, verification, decisions });
    const bullets = resume.experience[0]?.bullets.map((b) => b.text) ?? [];
    expect(bullets).toHaveLength(1);
    expect(bullets[0]).toBe(GOOD_BULLET_2);
  });

  it("lets a user rewrite a blocked line and take authorship", () => {
    const { profile, result, verification } = fixture();
    const decisions: LineDecision[] = [
      {
        claimPath: "experience[0].bullets[2]",
        action: "edit",
        editedText: "Supported a major platform scaling initiative"
      }
    ];
    const resume = assembleResume({ profile, result, verification, decisions });
    const edited = resume.experience[0]?.bullets.find((b) => b.origin === "edited");
    expect(edited?.text).toBe("Supported a major platform scaling initiative");
    expect(resume.experience[0]?.bullets).toHaveLength(3);
  });

  it("never exports a blocked line as generated — even if marked accept", () => {
    const { profile, result, verification } = fixture();
    const decisions: LineDecision[] = [
      { claimPath: "experience[0].bullets[2]", action: "accept", editedText: null }
    ];
    const resume = assembleResume({ profile, result, verification, decisions });
    const bullets = resume.experience[0]?.bullets.map((b) => b.text) ?? [];
    expect(bullets.join(" ")).not.toContain("90 million");
  });
});

describe("renderers and round-trip fidelity", () => {
  it("markdown export round-trips through the importer", async () => {
    const { profile, result, verification } = fixture();
    const resume = assembleResume({ profile, result, verification, decisions: [] });
    const markdown = renderResumeMarkdown(resume);

    expect(markdown).toContain("# Jane Smith");
    expect(markdown).toContain("Acme Corp");
    expect(markdown).not.toContain("90 million");

    const parsed = await parseResumeFile("resume.md", null, new TextEncoder().encode(markdown));
    for (const bullet of resume.experience[0]?.bullets ?? []) {
      expect(squash(parsed.text)).toContain(squash(bullet.text));
    }
    expect(squash(parsed.text)).toContain(squash("State University"));
  });

  it("docx export round-trips through mammoth", async () => {
    const { profile, result, verification } = fixture();
    const resume = assembleResume({ profile, result, verification, decisions: [] });
    const bytes = await renderResumeDocx(resume);
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });

    expect(squash(value)).toContain(squash("Jane Smith"));
    for (const bullet of resume.experience[0]?.bullets ?? []) {
      expect(squash(value)).toContain(squash(bullet.text));
    }
    expect(squash(value)).not.toContain(squash("90 million users"));
  });

  it("pdf export round-trips through the pdf parser", async () => {
    const { profile, result, verification } = fixture();
    const resume = assembleResume({ profile, result, verification, decisions: [] });
    const bytes = await renderResumePdf(resume);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");

    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    expect(squash(text)).toContain(squash("Jane Smith"));
    for (const bullet of resume.experience[0]?.bullets ?? []) {
      expect(squash(text)).toContain(squash(bullet.text));
    }
    expect(squash(text)).toContain(squash("Kubernetes"));
  });

  it("assembles and renders cover letters with decisions applied", () => {
    const { profile, result, verification } = fixture();
    const cover = assembleCoverLetter({
      profile,
      result,
      verification,
      decisions: [{ claimPath: "coverLetter[0]", action: "reject", editedText: null }],
      roleTitle: "Senior Platform Engineer",
      company: "Globex"
    });
    expect(cover?.paragraphs).toHaveLength(1);
    const markdown = renderCoverLetterMarkdown(cover!);
    expect(markdown).toContain("infrastructure costs 35%");
    expect(markdown).not.toContain("I would love");
  });
});
