import { z } from "zod";
import { normalize, squash } from "@/lib/profile/text";

/**
 * Job-description analysis: the runtime AI identifies requirements as
 * verbatim quotes plus matching keywords. Exactly like resume extraction,
 * the model's output is then deterministically grounded against the posting
 * text — requirements or keywords that do not appear in the posting are
 * dropped with warnings.
 */

const str = z.string();
const nstr = z.string().nullable();

export const jobAnalysisSchema = z.object({
  roleTitle: nstr,
  company: nstr,
  requirements: z
    .array(
      z.object({
        text: str,
        kind: z.enum(["must", "nice"]).nullable(),
        keywords: z.array(str).min(1).max(8)
      })
    )
    .max(40)
});

export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;

export interface GroundedRequirement {
  id: string;
  text: string;
  kind: "must" | "nice";
  keywords: string[];
}

export interface GroundedJobAnalysis {
  roleTitle: string | null;
  company: string | null;
  requirements: GroundedRequirement[];
  warnings: { value: string; reason: string }[];
}

export const JOB_ANALYSIS_SYSTEM_PROMPT = `You are the job-description analyst of a resume platform whose defining guarantee is zero fabrication.

Extract the requirements from one job posting.

Rules:
1. Each requirement's "text" is a verbatim quote from the posting (whitespace aside). Never paraphrase or summarize.
2. Keywords are the short skill/tool/qualification terms inside that quote, copied verbatim ("Python", "Kubernetes", "5+ years", "PhD"). No synonyms, no expansions, no inferred terms.
3. kind is "must" for required qualifications, "nice" for preferred/bonus ones, null when the posting does not indicate which.
4. roleTitle and company only if the posting states them verbatim; otherwise null.
5. Ignore boilerplate (benefits, EEO statements, application instructions).

You respond only through the provided tool schema.`;

export function buildJobAnalysisUserMessage(jobText: string): string {
  return `Extract the requirements from the job posting below. Verbatim quotes only.

<job_description>
${jobText}
</job_description>`;
}

/** Deterministic grounding of the analysis against the posting text. */
export function groundJobAnalysis(
  analysis: JobAnalysis,
  jobText: string,
  makeId: () => string
): GroundedJobAnalysis {
  const haystack = normalize(jobText);
  const haystackSquashed = haystack.replace(/ /g, "");
  const warnings: { value: string; reason: string }[] = [];

  const supported = (needle: string): boolean => {
    const spaced = normalize(needle);
    if (spaced.length === 0) {
      return false;
    }
    return haystack.includes(spaced) || haystackSquashed.includes(squash(needle));
  };

  const checkField = (value: string | null): string | null => {
    if (value === null) {
      return null;
    }
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (supported(trimmed)) {
      return trimmed;
    }
    warnings.push({ value: trimmed, reason: "Not found in the job posting." });
    return null;
  };

  const seen = new Set<string>();
  const requirements: GroundedRequirement[] = [];
  for (const requirement of analysis.requirements) {
    const text = requirement.text.replace(/\s+/g, " ").trim().slice(0, 500);
    if (text.length === 0) {
      continue;
    }
    if (!supported(text)) {
      warnings.push({ value: text, reason: "Requirement quote not found in the job posting." });
      continue;
    }
    const key = squash(text);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const keywords: string[] = [];
    for (const keyword of requirement.keywords) {
      const cleaned = keyword.replace(/\s+/g, " ").trim().slice(0, 80);
      if (cleaned.length === 0) {
        continue;
      }
      if (!supported(cleaned)) {
        warnings.push({ value: cleaned, reason: "Keyword not found in the job posting." });
        continue;
      }
      if (!keywords.some((k) => squash(k) === squash(cleaned))) {
        keywords.push(cleaned);
      }
    }
    if (keywords.length === 0) {
      warnings.push({
        value: text,
        reason: "Requirement dropped: none of its keywords appear in the posting."
      });
      continue;
    }

    requirements.push({
      id: makeId(),
      text,
      kind: requirement.kind ?? "must",
      keywords
    });
  }

  return {
    roleTitle: checkField(analysis.roleTitle),
    company: checkField(analysis.company),
    requirements: requirements.slice(0, 40),
    warnings
  };
}
