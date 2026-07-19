import type { Extraction } from "./extraction";
import { normalize, squash } from "./text";

/**
 * Ingestion-time grounding verification.
 *
 * The extraction model is instructed to copy verbatim — but instructions are
 * not enforcement. This module is: every substantive extracted string must
 * actually appear in the source document (after normalization tolerant of
 * line wraps and punctuation). Anything unsupported is removed from the
 * profile and reported as a warning. Pure, deterministic code.
 */

export interface GroundingWarning {
  section: string;
  value: string;
  reason: string;
}

export interface GroundingResult {
  extraction: Extraction;
  warnings: GroundingWarning[];
}

export function isSupported(
  haystackNormalized: string,
  haystackSquashed: string,
  needle: string
): boolean {
  const spaced = normalize(needle);
  if (spaced.length === 0) {
    return false;
  }
  if (haystackNormalized.includes(spaced)) {
    return true;
  }
  // Tolerate hyphenated line wraps and intra-word splits from PDF extraction.
  return haystackSquashed.includes(squash(needle));
}

export function verifyExtractionGrounded(
  extraction: Extraction,
  sourceText: string
): GroundingResult {
  const haystackNormalized = normalize(sourceText);
  const haystackSquashed = haystackNormalized.replace(/ /g, "");
  const warnings: GroundingWarning[] = [];

  const supported = (needle: string): boolean =>
    isSupported(haystackNormalized, haystackSquashed, needle);

  const checkNullable = (section: string, value: string | null): string | null => {
    if (value === null) {
      return null;
    }
    if (supported(value)) {
      return value;
    }
    warnings.push({ section, value, reason: "Not found in the source document." });
    return null;
  };

  const keepBullets = (section: string, bullets: string[]): string[] =>
    bullets.filter((bullet) => {
      if (supported(bullet)) {
        return true;
      }
      warnings.push({ section, value: bullet, reason: "Not found in the source document." });
      return false;
    });

  const basics = {
    fullName: checkNullable("basics.fullName", extraction.basics.fullName),
    headline: checkNullable("basics.headline", extraction.basics.headline),
    email: checkNullable("basics.email", extraction.basics.email),
    phone: checkNullable("basics.phone", extraction.basics.phone),
    location: checkNullable("basics.location", extraction.basics.location),
    links: extraction.basics.links.filter((link) => {
      if (supported(link.url) || supported(link.label)) {
        return true;
      }
      warnings.push({
        section: "basics.links",
        value: `${link.label} (${link.url})`,
        reason: "Not found in the source document."
      });
      return false;
    })
  };

  // The summary may be reflowed by extraction; verify it sentence-by-sentence
  // rather than as one string, dropping any unsupported sentence.
  let summary: string | null = null;
  if (extraction.summary !== null) {
    const sentences = extraction.summary
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const keptSentences = sentences.filter((sentence) => {
      if (supported(sentence)) {
        return true;
      }
      warnings.push({
        section: "summary",
        value: sentence,
        reason: "Not found in the source document."
      });
      return false;
    });
    summary = keptSentences.length > 0 ? keptSentences.join(" ") : null;
  }

  const experience = extraction.experience.filter((entry) => {
    if (!supported(entry.employer)) {
      warnings.push({
        section: "experience",
        value: `${entry.title} at ${entry.employer}`,
        reason: "Employer not found in the source document."
      });
      return false;
    }
    if (!supported(entry.title)) {
      warnings.push({
        section: "experience",
        value: `${entry.title} at ${entry.employer}`,
        reason: "Job title not found in the source document."
      });
      return false;
    }
    return true;
  });
  for (const entry of experience) {
    entry.location = checkNullable(`experience: ${entry.employer}`, entry.location);
    entry.bullets = keepBullets(`experience: ${entry.employer}`, entry.bullets);
    entry.startDate = checkDate(
      entry.startDate,
      haystackNormalized,
      haystackSquashed,
      warnings,
      `experience: ${entry.employer}`
    );
    entry.endDate = checkDate(
      entry.endDate,
      haystackNormalized,
      haystackSquashed,
      warnings,
      `experience: ${entry.employer}`
    );
  }

  const education = extraction.education.filter((entry) => {
    if (!supported(entry.institution)) {
      warnings.push({
        section: "education",
        value: entry.institution,
        reason: "Institution not found in the source document."
      });
      return false;
    }
    return true;
  });
  for (const entry of education) {
    entry.degree = checkNullable(`education: ${entry.institution}`, entry.degree);
    entry.field = checkNullable(`education: ${entry.institution}`, entry.field);
    entry.details = keepBullets(`education: ${entry.institution}`, entry.details);
    entry.startDate = checkDate(
      entry.startDate,
      haystackNormalized,
      haystackSquashed,
      warnings,
      `education: ${entry.institution}`
    );
    entry.endDate = checkDate(
      entry.endDate,
      haystackNormalized,
      haystackSquashed,
      warnings,
      `education: ${entry.institution}`
    );
  }

  const skills = extraction.skills.filter((skill) => {
    if (supported(skill.name)) {
      return true;
    }
    warnings.push({
      section: "skills",
      value: skill.name,
      reason: "Not found in the source document."
    });
    return false;
  });

  const certifications = extraction.certifications.filter((cert) => {
    if (supported(cert.name)) {
      return true;
    }
    warnings.push({
      section: "certifications",
      value: cert.name,
      reason: "Not found in the source document."
    });
    return false;
  });
  for (const cert of certifications) {
    cert.issuer = checkNullable(`certifications: ${cert.name}`, cert.issuer);
    cert.date = checkDate(
      cert.date,
      haystackNormalized,
      haystackSquashed,
      warnings,
      `certifications: ${cert.name}`
    );
  }

  const projects = extraction.projects.filter((project) => {
    if (supported(project.name)) {
      return true;
    }
    warnings.push({
      section: "projects",
      value: project.name,
      reason: "Not found in the source document."
    });
    return false;
  });
  for (const project of projects) {
    project.bullets = keepBullets(`projects: ${project.name}`, project.bullets);
    if (project.description !== null && !supported(project.description)) {
      warnings.push({
        section: `projects: ${project.name}`,
        value: project.description,
        reason: "Not found in the source document."
      });
      project.description = null;
    }
    if (project.url !== null && !supported(project.url)) {
      project.url = null;
    }
  }

  const awards = extraction.awards.filter((award) => {
    if (supported(award.title)) {
      return true;
    }
    warnings.push({
      section: "awards",
      value: award.title,
      reason: "Not found in the source document."
    });
    return false;
  });

  const languages = extraction.languages.filter((language) => {
    if (supported(language.name)) {
      return true;
    }
    warnings.push({
      section: "languages",
      value: language.name,
      reason: "Not found in the source document."
    });
    return false;
  });

  return {
    extraction: {
      basics,
      summary,
      experience,
      education,
      skills,
      certifications,
      projects,
      awards,
      languages
    },
    warnings
  };
}

/**
 * Dates need their own check: "2019-03" must be supported by "2019" appearing
 * in the document (months are often written as words, so we require at least
 * the year to be literally present).
 */
function checkDate(
  value: string | null,
  haystackNormalized: string,
  haystackSquashed: string,
  warnings: GroundingWarning[],
  section: string
): string | null {
  if (value === null) {
    return null;
  }
  const year = value.slice(0, 4);
  if (haystackNormalized.includes(year) || haystackSquashed.includes(year)) {
    return value;
  }
  warnings.push({
    section,
    value,
    reason: `Year ${year} not found in the source document.`
  });
  return null;
}
