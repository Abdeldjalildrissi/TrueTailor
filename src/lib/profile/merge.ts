import type { Extraction } from "./extraction";
import { squash } from "./text";

/**
 * Deterministic merge of per-chunk extractions into one extraction.
 * Pure code: dedupes and unions, never synthesizes content.
 */
export function mergeExtractions(parts: Extraction[]): Extraction {
  const first = parts[0];
  if (!first) {
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
  if (parts.length === 1) {
    return first;
  }

  const firstNonNull = (values: (string | null)[]): string | null =>
    values.find((v) => v !== null) ?? null;

  const mergedLinks = new Map<string, { label: string; url: string }>();
  for (const part of parts) {
    for (const link of part.basics.links) {
      const key = link.url.toLowerCase();
      if (!mergedLinks.has(key)) {
        mergedLinks.set(key, link);
      }
    }
  }

  type Exp = Extraction["experience"][number];
  const experience = new Map<string, Exp>();
  for (const part of parts) {
    for (const entry of part.experience) {
      const key = `${squash(entry.employer)}|${squash(entry.title)}`;
      const existing = experience.get(key);
      if (!existing) {
        experience.set(key, { ...entry, bullets: [...entry.bullets] });
        continue;
      }
      // Union bullets; prefer non-null scalar fields from whichever chunk had them.
      const seen = new Set(existing.bullets.map((b) => squash(b)));
      for (const bullet of entry.bullets) {
        if (!seen.has(squash(bullet))) {
          seen.add(squash(bullet));
          existing.bullets.push(bullet);
        }
      }
      existing.location = existing.location ?? entry.location;
      existing.startDate = existing.startDate ?? entry.startDate;
      existing.endDate = existing.endDate ?? entry.endDate;
      existing.isCurrent = existing.isCurrent || entry.isCurrent;
    }
  }

  type Edu = Extraction["education"][number];
  const education = new Map<string, Edu>();
  for (const part of parts) {
    for (const entry of part.education) {
      const key = `${squash(entry.institution)}|${squash(entry.degree ?? "")}|${squash(entry.field ?? "")}`;
      const existing = education.get(key);
      if (!existing) {
        education.set(key, { ...entry, details: [...entry.details] });
        continue;
      }
      const seen = new Set(existing.details.map((d) => squash(d)));
      for (const detail of entry.details) {
        if (!seen.has(squash(detail))) {
          seen.add(squash(detail));
          existing.details.push(detail);
        }
      }
      existing.startDate = existing.startDate ?? entry.startDate;
      existing.endDate = existing.endDate ?? entry.endDate;
    }
  }

  const dedupeBy = <T>(items: T[], keyOf: (item: T) => string): T[] => {
    const map = new Map<string, T>();
    for (const item of items) {
      const key = keyOf(item);
      if (!map.has(key)) {
        map.set(key, item);
      }
    }
    return [...map.values()];
  };

  return {
    basics: {
      fullName: firstNonNull(parts.map((p) => p.basics.fullName)),
      headline: firstNonNull(parts.map((p) => p.basics.headline)),
      email: firstNonNull(parts.map((p) => p.basics.email)),
      phone: firstNonNull(parts.map((p) => p.basics.phone)),
      location: firstNonNull(parts.map((p) => p.basics.location)),
      links: [...mergedLinks.values()]
    },
    summary:
      parts
        .map((p) => p.summary)
        .filter((s): s is string => s !== null)
        .sort((a, b) => b.length - a.length)[0] ?? null,
    experience: [...experience.values()],
    education: [...education.values()],
    skills: dedupeBy(
      parts.flatMap((p) => p.skills),
      (s) => squash(s.name)
    ),
    certifications: dedupeBy(
      parts.flatMap((p) => p.certifications),
      (c) => `${squash(c.name)}|${squash(c.issuer ?? "")}`
    ),
    projects: dedupeBy(
      parts.flatMap((p) => p.projects),
      (p) => squash(p.name)
    ),
    awards: dedupeBy(
      parts.flatMap((p) => p.awards),
      (a) => `${squash(a.title)}|${squash(a.issuer ?? "")}`
    ),
    languages: dedupeBy(
      parts.flatMap((p) => p.languages),
      (l) => squash(l.name)
    )
  };
}
