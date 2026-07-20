import { describe, expect, it } from "vitest";
import { assembleResume, type LineDecision } from "@/lib/export/assemble";
import { escapeLatex, renderResumeLatex } from "@/lib/export/latex";
import { emptyProfile, materializeProfile, type Profile } from "@/lib/profile/schema";
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
      phone: "+1 555 0100",
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
        details: [{ text: "GPA 3.9" }]
      }
    ],
    skills: [
      { name: "Kubernetes", category: "Software" },
      { name: "Python", category: "Software" },
      { name: "Team Supervision", category: "Soft-skills" }
    ],
    certifications: [{ name: "CKA Certification", issuer: "CNCF", date: "2021" }],
    languages: [{ name: "English", proficiency: "Native" }]
  });
}

function assembled(decisions: LineDecision[] = []) {
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
          { text: GOOD_BULLET_1, sourceIds: [b1?.id ?? ""] },
          { text: GOOD_BULLET_2, sourceIds: [b2?.id ?? ""] },
          { text: FABRICATED_BULLET, sourceIds: [b1?.id ?? ""] } // verifier blocks
        ]
      }
    ],
    skillIds: profile.skills.map((s) => s.id),
    coverLetter: null
  };
  const verification = verifyTailoredResume(profile, result, "Globex is hiring.");
  return assembleResume({ profile, result, verification, decisions });
}

describe("escapeLatex", () => {
  it("escapes every LaTeX special so user data cannot inject commands", () => {
    const escaped = escapeLatex("R&D 100% $5 #1 a_b {x} ~y ^z \\cmd");
    expect(escaped).toBe(
      "R\\&D 100\\% \\$5 \\#1 a\\_b \\{x\\} \\textasciitilde{}y \\textasciicircum{}z \\textbackslash{}cmd"
    );
  });
});

describe("renderResumeLatex: template fidelity and the export gate", () => {
  it("preserves the reference template's structure and injects the resume data", () => {
    const tex = renderResumeLatex(assembled(), { photoFilename: null });

    // Template skeleton, verbatim from the reference.
    expect(tex).toContain("\\documentclass[11pt, a4paper]{article}");
    expect(tex).toContain("\\usepackage{mathptmx}");
    expect(tex).toContain("\\definecolor{primary}{HTML}{2B3E50}");
    expect(tex).toContain("\\columnratio{0.32}");
    expect(tex).toContain("\\begin{paracol}{2}");
    expect(tex).toContain("\\rule{\\linewidth}{1.2pt}");

    // Injected data in the template's slots.
    expect(tex).toContain("{\\Huge \\bfseries Jane Smith}");
    expect(tex).toContain("Senior Software Engineer");
    expect(tex).toContain("\\textbf{Mob:} +1 555 0100");
    expect(tex).toContain("jane@example.com");
    expect(tex).toContain("\\section*{Software}");
    expect(tex).toContain("\\section*{Soft-skills}");
    expect(tex).toContain("\\section*{Languages}");
    expect(tex).toContain("English: Native");
    expect(tex).toContain("\\section*{Professional experience:}");
    expect(tex).toContain("2019 – Present");
    expect(tex).toContain("\\section*{Certificates and Attestation}");
    expect(tex).toContain("CKA Certification");
    expect(tex).toContain("\\section*{Education:}");
    expect(tex).toContain("BS in Computer Science");
    expect(tex).toContain("GPA 3.9");
  });

  it("never renders verifier-blocked lines", () => {
    const tex = renderResumeLatex(assembled(), { photoFilename: null });
    expect(tex).toContain("Cut infrastructure costs 35\\%");
    expect(tex).not.toContain("90 million");
  });

  it("renders a user rewrite (authorship taken) instead of the generated line", () => {
    const tex = renderResumeLatex(
      assembled([
        {
          claimPath: "experience[0].bullets[0]",
          action: "edit",
          editedText: "Owned the Kubernetes billing migration"
        }
      ]),
      { photoFilename: null }
    );
    expect(tex).toContain("Owned the Kubernetes billing migration");
    expect(tex).not.toContain("Migrated billing services to Kubernetes");
  });

  it("includes the photo block only when a photo ships with the export", () => {
    const withPhoto = renderResumeLatex(assembled(), { photoFilename: "photo.jpg" });
    expect(withPhoto).toContain("\\includegraphics[width=0.75\\linewidth]{photo.jpg}");

    const without = renderResumeLatex(assembled(), { photoFilename: null });
    expect(without).not.toContain("\\includegraphics");
    // The two-column design survives either way.
    expect(without).toContain("\\begin{leftcolumn}");
    expect(without).toContain("\\begin{rightcolumn}");
  });

  it("escapes user data end to end", () => {
    const profile = fixtureProfile();
    profile.basics.fullName = "Jane & Bob_Smith";
    const role = profile.experience[0];
    if (!role) {
      throw new Error("fixture requires a role");
    }
    const result: TailoredResume = {
      summary: null,
      experience: [],
      skillIds: [],
      coverLetter: null
    };
    const verification = verifyTailoredResume(profile, result, "posting");
    const resume = assembleResume({ profile, result, verification, decisions: [] });
    const tex = renderResumeLatex(resume, { photoFilename: null });
    expect(tex).toContain("Jane \\& Bob\\_Smith");
    expect(tex).not.toContain("Jane & Bob_Smith");
  });
});
