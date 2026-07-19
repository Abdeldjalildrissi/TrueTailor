import { nanoid } from "nanoid";
import { z } from "zod";

/**
 * The structured profile is the single authoritative source of truth about a
 * user. Every entry carries a stable unique ID; downstream generation may
 * only reference these IDs, and the deterministic verifier resolves claims
 * against them. Information absent from the profile does not exist.
 */

export const PARTIAL_DATE_PATTERN = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

const partialDate = z.string().regex(PARTIAL_DATE_PATTERN, "Dates use YYYY or YYYY-MM format.");

const entityId = z.string().min(6).max(40);
const shortText = z.string().trim().min(1).max(200);
const bulletText = z.string().trim().min(1).max(600);

const bulletSchema = z.object({
  id: entityId,
  text: bulletText
});

const linkSchema = z.object({
  id: entityId,
  label: shortText.max(60),
  url: z.string().trim().url().max(500)
});

const basicsSchema = z.object({
  fullName: shortText.max(120).nullable(),
  headline: shortText.max(160).nullable(),
  email: z.string().trim().email().max(254).nullable(),
  phone: shortText.max(40).nullable(),
  location: shortText.max(120).nullable(),
  links: z.array(linkSchema).max(20)
});

const experienceSchema = z.object({
  id: entityId,
  employer: shortText.max(160),
  title: shortText.max(160),
  location: shortText.max(120).nullable(),
  startDate: partialDate.nullable(),
  endDate: partialDate.nullable(),
  isCurrent: z.boolean(),
  bullets: z.array(bulletSchema).max(40)
});

const educationSchema = z.object({
  id: entityId,
  institution: shortText.max(160),
  degree: shortText.max(160).nullable(),
  field: shortText.max(160).nullable(),
  startDate: partialDate.nullable(),
  endDate: partialDate.nullable(),
  details: z.array(bulletSchema).max(20)
});

const skillSchema = z.object({
  id: entityId,
  name: shortText.max(80),
  category: shortText.max(80).nullable()
});

const certificationSchema = z.object({
  id: entityId,
  name: shortText.max(160),
  issuer: shortText.max(160).nullable(),
  date: partialDate.nullable()
});

const projectSchema = z.object({
  id: entityId,
  name: shortText.max(160),
  description: z.string().trim().min(1).max(1000).nullable(),
  url: z.string().trim().url().max(500).nullable(),
  bullets: z.array(bulletSchema).max(30)
});

const awardSchema = z.object({
  id: entityId,
  title: shortText.max(160),
  issuer: shortText.max(160).nullable(),
  date: partialDate.nullable()
});

const languageSchema = z.object({
  id: entityId,
  name: shortText.max(80),
  proficiency: shortText.max(80).nullable()
});

export const profileSchema = z.object({
  basics: basicsSchema,
  summary: z.object({ id: entityId, text: z.string().trim().min(1).max(2000) }).nullable(),
  experience: z.array(experienceSchema).max(60),
  education: z.array(educationSchema).max(30),
  skills: z.array(skillSchema).max(200),
  certifications: z.array(certificationSchema).max(50),
  projects: z.array(projectSchema).max(50),
  awards: z.array(awardSchema).max(50),
  languages: z.array(languageSchema).max(30)
});

export type Profile = z.infer<typeof profileSchema>;
export type ExperienceEntry = z.infer<typeof experienceSchema>;
export type EducationEntry = z.infer<typeof educationSchema>;
export type SkillEntry = z.infer<typeof skillSchema>;
export type Bullet = z.infer<typeof bulletSchema>;

/**
 * Input variant for user edits: identical shape, but ids are optional —
 * entries without ids are new and receive server-assigned ids.
 */
const optionalId = { id: entityId.optional() };

export const profileInputSchema = z.object({
  basics: basicsSchema.extend({
    links: z.array(linkSchema.extend(optionalId)).max(20)
  }),
  summary: z.object({ ...optionalId, text: z.string().trim().min(1).max(2000) }).nullable(),
  experience: z
    .array(
      experienceSchema.extend({
        ...optionalId,
        bullets: z.array(bulletSchema.extend(optionalId)).max(40)
      })
    )
    .max(60),
  education: z
    .array(
      educationSchema.extend({
        ...optionalId,
        details: z.array(bulletSchema.extend(optionalId)).max(20)
      })
    )
    .max(30),
  skills: z.array(skillSchema.extend(optionalId)).max(200),
  certifications: z.array(certificationSchema.extend(optionalId)).max(50),
  projects: z
    .array(
      projectSchema.extend({
        ...optionalId,
        bullets: z.array(bulletSchema.extend(optionalId)).max(30)
      })
    )
    .max(50),
  awards: z.array(awardSchema.extend(optionalId)).max(50),
  languages: z.array(languageSchema.extend(optionalId)).max(30)
});

export type ProfileInput = z.infer<typeof profileInputSchema>;

export function newEntityId(): string {
  return nanoid();
}

/** Assigns ids to any input entry that lacks one, producing a full Profile. */
export function materializeProfile(input: ProfileInput): Profile {
  const id = (existing?: string) => existing ?? newEntityId();
  return profileSchema.parse({
    basics: {
      ...input.basics,
      links: input.basics.links.map((l) => ({ ...l, id: id(l.id) }))
    },
    summary: input.summary ? { id: id(input.summary.id), text: input.summary.text } : null,
    experience: input.experience.map((e) => ({
      ...e,
      id: id(e.id),
      bullets: e.bullets.map((b) => ({ id: id(b.id), text: b.text }))
    })),
    education: input.education.map((e) => ({
      ...e,
      id: id(e.id),
      details: e.details.map((b) => ({ id: id(b.id), text: b.text }))
    })),
    skills: input.skills.map((s) => ({ ...s, id: id(s.id) })),
    certifications: input.certifications.map((c) => ({ ...c, id: id(c.id) })),
    projects: input.projects.map((p) => ({
      ...p,
      id: id(p.id),
      bullets: p.bullets.map((b) => ({ id: id(b.id), text: b.text }))
    })),
    awards: input.awards.map((a) => ({ ...a, id: id(a.id) })),
    languages: input.languages.map((l) => ({ ...l, id: id(l.id) }))
  });
}

/** Compares partial dates; returns negative/zero/positive like a comparator. */
export function comparePartialDates(a: string, b: string): number {
  const [ay, am] = a.split("-");
  const [by, bm] = b.split("-");
  const yearDiff = Number(ay) - Number(by);
  if (yearDiff !== 0) {
    return yearDiff;
  }
  // Same year: only comparable when both carry months.
  if (am && bm) {
    return Number(am) - Number(bm);
  }
  return 0;
}

export interface ProfileIssue {
  path: string;
  message: string;
}

/** Business-rule validation beyond shape: date ordering and id uniqueness. */
export function validateProfileRules(profile: Profile): ProfileIssue[] {
  const issues: ProfileIssue[] = [];
  const seenIds = new Set<string>();

  const checkId = (path: string, idValue: string) => {
    if (seenIds.has(idValue)) {
      issues.push({ path, message: `Duplicate entry id ${idValue}.` });
    }
    seenIds.add(idValue);
  };

  profile.basics.links.forEach((l, i) => checkId(`basics.links[${i}]`, l.id));
  if (profile.summary) {
    checkId("summary", profile.summary.id);
  }

  const dateRanged = [
    ...profile.experience.map((e, i) => ({ path: `experience[${i}]`, e })),
    ...profile.education.map((e, i) => ({ path: `education[${i}]`, e }))
  ];
  for (const { path, e } of dateRanged) {
    if (e.startDate && e.endDate && comparePartialDates(e.startDate, e.endDate) > 0) {
      issues.push({ path, message: "Start date is after end date." });
    }
  }

  profile.experience.forEach((e, i) => {
    checkId(`experience[${i}]`, e.id);
    e.bullets.forEach((b, j) => checkId(`experience[${i}].bullets[${j}]`, b.id));
    if (e.isCurrent && e.endDate) {
      issues.push({
        path: `experience[${i}]`,
        message: "A current role cannot also have an end date."
      });
    }
  });
  profile.education.forEach((e, i) => {
    checkId(`education[${i}]`, e.id);
    e.details.forEach((b, j) => checkId(`education[${i}].details[${j}]`, b.id));
  });
  profile.skills.forEach((s, i) => checkId(`skills[${i}]`, s.id));
  profile.certifications.forEach((c, i) => checkId(`certifications[${i}]`, c.id));
  profile.projects.forEach((p, i) => {
    checkId(`projects[${i}]`, p.id);
    p.bullets.forEach((b, j) => checkId(`projects[${i}].bullets[${j}]`, b.id));
  });
  profile.awards.forEach((a, i) => checkId(`awards[${i}]`, a.id));
  profile.languages.forEach((l, i) => checkId(`languages[${i}]`, l.id));

  return issues;
}

export function emptyProfile(): Profile {
  return {
    basics: {
      fullName: null,
      headline: null,
      email: null,
      phone: null,
      location: null,
      links: []
    },
    summary: null,
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    projects: [],
    awards: [],
    languages: []
  };
}
