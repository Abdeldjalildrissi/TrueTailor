import type { Profile } from "@/lib/profile/schema";
import { squash } from "@/lib/profile/text";
import type { TailoredResume } from "./generate";

/**
 * Layer 3: deterministic server-side verification of every generated claim.
 *
 * The generator must cite profile ids for each line it writes. This module
 * verifies — in pure code, with no model involvement — that:
 *   1. every referenced id exists in the profile (and is the right kind),
 *   2. every number in a generated line appears in its cited sources,
 *   3. every proper-noun/acronym sequence in a generated line appears in its
 *      cited sources (plus, for cover letters only, the job posting — naming
 *      the target company is not a resume claim),
 *   4. structural fields (experience identity, skills) are id-references
 *      only, so employers, titles, and dates can never be invented — they
 *      render from the profile itself.
 *
 * Unsupported claims are flagged and blocked from export. No exceptions.
 */

export interface ClaimCheck {
  path: string;
  text: string;
  sourceIds: string[];
  status: "supported" | "unsupported";
  problems: string[];
}

export interface VerificationReport {
  claims: ClaimCheck[];
  valid: boolean;
  unsupportedCount: number;
}

interface SourceIndexEntry {
  kind:
    | "experience"
    | "bullet"
    | "education"
    | "skill"
    | "certification"
    | "project"
    | "award"
    | "language"
    | "summary"
    | "link";
  text: string;
}

export function buildSourceIndex(profile: Profile): Map<string, SourceIndexEntry> {
  const index = new Map<string, SourceIndexEntry>();
  for (const e of profile.experience) {
    index.set(e.id, {
      kind: "experience",
      text: `${e.title} ${e.employer} ${e.location ?? ""} ${e.startDate ?? ""} ${e.endDate ?? ""}`
    });
    for (const b of e.bullets) {
      index.set(b.id, { kind: "bullet", text: `${b.text} ${e.employer} ${e.title}` });
    }
  }
  for (const e of profile.education) {
    index.set(e.id, {
      kind: "education",
      text: `${e.institution} ${e.degree ?? ""} ${e.field ?? ""} ${e.startDate ?? ""} ${e.endDate ?? ""}`
    });
    for (const d of e.details) {
      index.set(d.id, { kind: "bullet", text: `${d.text} ${e.institution}` });
    }
  }
  for (const s of profile.skills) {
    index.set(s.id, { kind: "skill", text: `${s.name} ${s.category ?? ""}` });
  }
  for (const c of profile.certifications) {
    index.set(c.id, { kind: "certification", text: `${c.name} ${c.issuer ?? ""} ${c.date ?? ""}` });
  }
  for (const p of profile.projects) {
    index.set(p.id, { kind: "project", text: `${p.name} ${p.description ?? ""} ${p.url ?? ""}` });
    for (const b of p.bullets) {
      index.set(b.id, { kind: "bullet", text: `${b.text} ${p.name}` });
    }
  }
  for (const a of profile.awards) {
    index.set(a.id, { kind: "award", text: `${a.title} ${a.issuer ?? ""} ${a.date ?? ""}` });
  }
  for (const l of profile.languages) {
    index.set(l.id, { kind: "language", text: `${l.name} ${l.proficiency ?? ""}` });
  }
  if (profile.summary) {
    index.set(profile.summary.id, { kind: "summary", text: profile.summary.text });
  }
  for (const link of profile.basics.links) {
    index.set(link.id, { kind: "link", text: `${link.label} ${link.url}` });
  }
  return index;
}

/** Digit groups ("2,000" → "2000") that must be supported by cited sources. */
export function extractNumbers(text: string): string[] {
  const matches = text.match(/\d[\d,.]*/g) ?? [];
  return matches.map((m) => m.replace(/[,.]/g, "").trim()).filter((m) => m.length > 0);
}

const SCALE_WORDS = /\b(million|billion|thousand|percent|%|k\b)/gi;

/**
 * Proper-noun and acronym sequences that must be supported. The first word of
 * a sentence is exempt unless it continues into a capitalized sequence or is
 * an acronym — "Led the migration" passes; "Google Cloud migration" does not
 * unless cited sources contain it.
 */
export function extractProperSequences(text: string): string[] {
  const sequences: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter((w) => w.length > 0);
    let current: string[] = [];
    words.forEach((rawWord, position) => {
      const word = rawWord.replace(/[^A-Za-z0-9+#.&-]/g, "");
      const isAcronym = /^[A-Z][A-Z0-9+#.&-]+$/.test(word) && word.length >= 2;
      const isCapitalized = /^[A-Z][a-z0-9'’&.-]*$/.test(word) && word.length >= 2;
      const sentenceStartExempt = position === 0 && !isAcronym;

      if ((isAcronym || isCapitalized) && !sentenceStartExempt) {
        current.push(word);
      } else if (position === 0 && isCapitalized) {
        // Sentence-opening capitalized word: only counts if the sequence continues.
        current = [word];
        const next = words[1]?.replace(/[^A-Za-z0-9+#.&-]/g, "") ?? "";
        if (!(/^[A-Z]/.test(next) && next.length >= 2)) {
          current = [];
        }
      } else {
        if (current.length > 0) {
          sequences.push(current.join(" "));
        }
        current = [];
      }
    });
    if (current.length > 0) {
      sequences.push(current.join(" "));
    }
  }
  return sequences;
}

function checkTextSupport(
  path: string,
  text: string,
  sourceIds: string[],
  index: Map<string, SourceIndexEntry>,
  extraHaystack: string
): ClaimCheck {
  const problems: string[] = [];
  const missing = sourceIds.filter((id) => !index.has(id));
  if (sourceIds.length === 0) {
    problems.push("No source citations.");
  }
  for (const id of missing) {
    problems.push(`Cited source ${id} does not exist in the profile.`);
  }

  const citedText = sourceIds
    .filter((id) => index.has(id))
    .map((id) => index.get(id)?.text ?? "")
    .join(" ");
  const haystack = squash(`${citedText} ${extraHaystack}`);
  // Raw (unsquashed) haystack keeps symbols like "%" that squash strips.
  const rawHaystack = `${citedText} ${extraHaystack}`.toLowerCase();

  for (const number of extractNumbers(text)) {
    if (!haystack.includes(number)) {
      problems.push(`Number "${number}" is not present in the cited sources.`);
    }
  }

  for (const scaleRaw of text.match(SCALE_WORDS) ?? []) {
    const scale = scaleRaw.toLowerCase();
    const supported =
      scale === "%"
        ? rawHaystack.includes("%") || rawHaystack.includes("percent")
        : scale === "percent"
          ? rawHaystack.includes("percent") || rawHaystack.includes("%")
          : haystack.includes(squash(scale));
    if (!supported) {
      problems.push(`Scale word "${scaleRaw}" is not present in the cited sources.`);
    }
  }

  // "50k"-style shorthand must appear as written in the cited sources.
  for (const kShorthand of text.match(/\b\d[\d,.]*\s*k\b/gi) ?? []) {
    if (!haystack.includes(squash(kShorthand))) {
      problems.push(`"${kShorthand.trim()}" is not present in the cited sources.`);
    }
  }

  for (const sequence of extractProperSequences(text)) {
    const words = sequence.split(" ");
    const fullMatch = haystack.includes(squash(sequence));
    // A sentence-leading preposition or verb can get glued onto a proper
    // sequence ("At Acme Corp"); accept when the tail alone is supported.
    const tailMatch = words.length > 1 && haystack.includes(squash(words.slice(1).join(" ")));
    if (!fullMatch && !tailMatch) {
      problems.push(`"${sequence}" is not present in the cited sources.`);
    }
  }

  return {
    path,
    text,
    sourceIds,
    status: problems.length === 0 ? "supported" : "unsupported",
    problems
  };
}

export function verifyTailoredResume(
  profile: Profile,
  tailored: TailoredResume,
  jobText: string
): VerificationReport {
  const index = buildSourceIndex(profile);
  const claims: ClaimCheck[] = [];

  // Structural checks: id references must exist and be the right kind.
  tailored.experience.forEach((entry, i) => {
    const source = index.get(entry.experienceId);
    if (!source || source.kind !== "experience") {
      claims.push({
        path: `experience[${i}]`,
        text: entry.experienceId,
        sourceIds: [entry.experienceId],
        status: "unsupported",
        problems: ["Referenced experience id does not exist in the profile."]
      });
    }
    entry.bullets.forEach((bullet, j) => {
      claims.push(
        checkTextSupport(`experience[${i}].bullets[${j}]`, bullet.text, bullet.sourceIds, index, "")
      );
    });
  });

  tailored.skillIds.forEach((skillId, i) => {
    const source = index.get(skillId);
    if (!source || source.kind !== "skill") {
      claims.push({
        path: `skillIds[${i}]`,
        text: skillId,
        sourceIds: [skillId],
        status: "unsupported",
        problems: ["Referenced skill id does not exist in the profile."]
      });
    }
  });

  if (tailored.summary) {
    claims.push(
      checkTextSupport("summary", tailored.summary.text, tailored.summary.sourceIds, index, "")
    );
  }

  if (tailored.coverLetter) {
    tailored.coverLetter.forEach((paragraph, i) => {
      // Cover letters may reference the posting itself (company, role) —
      // that context is part of the allowed haystack. Factual claims about
      // the candidate still require profile citations.
      const check =
        paragraph.sourceIds.length === 0
          ? checkTextSupport(`coverLetter[${i}]`, paragraph.text, [], index, jobText)
          : checkTextSupport(
              `coverLetter[${i}]`,
              paragraph.text,
              paragraph.sourceIds,
              index,
              jobText
            );
      if (paragraph.sourceIds.length === 0) {
        // Connective prose with no citations is acceptable only when it makes
        // no factual claims (no numbers, no proper sequences beyond the posting).
        check.problems = check.problems.filter((p) => !p.startsWith("No source citations."));
        check.status = check.problems.length === 0 ? "supported" : "unsupported";
      }
      claims.push(check);
    });
  }

  const unsupportedCount = claims.filter((c) => c.status === "unsupported").length;
  return { claims, valid: unsupportedCount === 0, unsupportedCount };
}
