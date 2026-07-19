import type { Profile } from "@/lib/profile/schema";
import type { TailoredResume } from "@/lib/tailor/generate";
import type { VerificationReport } from "@/lib/tailor/verify";

/**
 * Assembly of the final exportable documents. This is where the export gate
 * lives: a generated line reaches an export only if
 *   - the deterministic verifier marked it supported, AND the user did not
 *     reject it; or
 *   - the user explicitly rewrote it (edit = user takes authorship, the same
 *     trust rule as profile edits).
 * Blocked lines can never be exported as-generated — accepting a blocked
 * line is not a representable state. No exceptions.
 */

export type DecisionAction = "accept" | "reject" | "edit";

export interface LineDecision {
  claimPath: string;
  action: DecisionAction;
  editedText: string | null;
}

export interface ExportLine {
  text: string;
  origin: "generated" | "edited";
}

export interface ExportExperience {
  title: string;
  employer: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  bullets: ExportLine[];
}

export interface ExportResume {
  fullName: string;
  headline: string | null;
  contacts: string[];
  links: { label: string; url: string }[];
  summary: ExportLine | null;
  experience: ExportExperience[];
  skills: string[];
  education: {
    institution: string;
    degree: string | null;
    field: string | null;
    startDate: string | null;
    endDate: string | null;
    details: string[];
  }[];
  certifications: { name: string; issuer: string | null; date: string | null }[];
  languages: { name: string; proficiency: string | null }[];
}

export interface ExportCoverLetter {
  fullName: string;
  roleTitle: string | null;
  company: string | null;
  paragraphs: ExportLine[];
}

interface AssembleInput {
  profile: Profile;
  result: TailoredResume;
  verification: VerificationReport;
  decisions: LineDecision[];
}

function decisionMap(decisions: LineDecision[]): Map<string, LineDecision> {
  return new Map(decisions.map((d) => [d.claimPath, d]));
}

function statusMap(verification: VerificationReport): Map<string, "supported" | "unsupported"> {
  return new Map(verification.claims.map((c) => [c.path, c.status]));
}

function resolveLine(
  path: string,
  generatedText: string,
  decisions: Map<string, LineDecision>,
  statuses: Map<string, "supported" | "unsupported">
): ExportLine | null {
  const decision = decisions.get(path);
  if (decision?.action === "reject") {
    return null;
  }
  if (decision?.action === "edit" && decision.editedText && decision.editedText.trim().length > 0) {
    return { text: decision.editedText.trim(), origin: "edited" };
  }
  // Export gate: unverified lines never ship as generated.
  if (statuses.get(path) === "unsupported") {
    return null;
  }
  return { text: generatedText, origin: "generated" };
}

export function assembleResume(input: AssembleInput): ExportResume {
  const { profile, result, verification } = input;
  const decisions = decisionMap(input.decisions);
  const statuses = statusMap(verification);
  const experienceById = new Map(profile.experience.map((e) => [e.id, e]));
  const skillById = new Map(profile.skills.map((s) => [s.id, s]));

  const summary = result.summary
    ? resolveLine("summary", result.summary.text, decisions, statuses)
    : null;

  const experience: ExportExperience[] = [];
  result.experience.forEach((entry, i) => {
    const source = experienceById.get(entry.experienceId);
    if (!source) {
      return;
    }
    const bullets: ExportLine[] = [];
    entry.bullets.forEach((bullet, j) => {
      const line = resolveLine(`experience[${i}].bullets[${j}]`, bullet.text, decisions, statuses);
      if (line) {
        bullets.push(line);
      }
    });
    experience.push({
      title: source.title,
      employer: source.employer,
      location: source.location,
      startDate: source.startDate,
      endDate: source.endDate,
      isCurrent: source.isCurrent,
      bullets
    });
  });

  const skills: string[] = [];
  for (const skillId of result.skillIds) {
    const skill = skillById.get(skillId);
    if (skill && !skills.includes(skill.name)) {
      skills.push(skill.name);
    }
  }

  return {
    fullName: profile.basics.fullName ?? "Resume",
    headline: profile.basics.headline,
    contacts: [profile.basics.email, profile.basics.phone, profile.basics.location].filter(
      (v): v is string => Boolean(v)
    ),
    links: profile.basics.links.map((l) => ({ label: l.label, url: l.url })),
    summary,
    experience,
    skills,
    // Identity-level profile facts are included as verified data.
    education: profile.education.map((e) => ({
      institution: e.institution,
      degree: e.degree,
      field: e.field,
      startDate: e.startDate,
      endDate: e.endDate,
      details: e.details.map((d) => d.text)
    })),
    certifications: profile.certifications.map((c) => ({
      name: c.name,
      issuer: c.issuer,
      date: c.date
    })),
    languages: profile.languages.map((l) => ({ name: l.name, proficiency: l.proficiency }))
  };
}

export function assembleCoverLetter(
  input: AssembleInput & { roleTitle: string | null; company: string | null }
): ExportCoverLetter | null {
  const { result, verification } = input;
  if (!result.coverLetter || result.coverLetter.length === 0) {
    return null;
  }
  const decisions = decisionMap(input.decisions);
  const statuses = statusMap(verification);

  const paragraphs: ExportLine[] = [];
  result.coverLetter.forEach((paragraph, i) => {
    const line = resolveLine(`coverLetter[${i}]`, paragraph.text, decisions, statuses);
    if (line) {
      paragraphs.push(line);
    }
  });
  if (paragraphs.length === 0) {
    return null;
  }
  return {
    fullName: input.profile.basics.fullName ?? "",
    roleTitle: input.roleTitle,
    company: input.company,
    paragraphs
  };
}

/** Paths that may legally carry a decision for a given result. */
export function decidablePaths(result: TailoredResume): Set<string> {
  const paths = new Set<string>();
  if (result.summary) {
    paths.add("summary");
  }
  result.experience.forEach((entry, i) => {
    entry.bullets.forEach((_, j) => {
      paths.add(`experience[${i}].bullets[${j}]`);
    });
  });
  (result.coverLetter ?? []).forEach((_, i) => {
    paths.add(`coverLetter[${i}]`);
  });
  return paths;
}

export function formatDateRange(
  startDate: string | null,
  endDate: string | null,
  isCurrent: boolean
): string {
  const start = startDate ?? "";
  const end = isCurrent ? "Present" : (endDate ?? "");
  if (!start && !end) {
    return "";
  }
  return `${start || "…"} – ${end || "…"}`;
}
