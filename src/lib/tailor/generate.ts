import { z } from "zod";
import type { Profile } from "@/lib/profile/schema";
import type { GroundedJobAnalysis } from "./job-analysis";
import type { RankingResult } from "./rank";

/**
 * The generation contract (Layer 1 + 2): the model may only select, order,
 * and rewrite cited profile content. It cannot emit employers, titles, or
 * dates — those are id references rendered from the profile. Every line of
 * prose carries sourceIds, which Layer 3 verifies deterministically.
 */

const id = z.string().min(1);

export const tailoredResumeSchema = z.object({
  summary: z
    .object({
      text: z.string().min(1).max(1200),
      sourceIds: z.array(id).min(1).max(12)
    })
    .nullable(),
  experience: z
    .array(
      z.object({
        experienceId: id,
        bullets: z
          .array(
            z.object({
              text: z.string().min(1).max(600),
              sourceIds: z.array(id).min(1).max(8)
            })
          )
          .max(12)
      })
    )
    .max(20),
  skillIds: z.array(id).max(30),
  coverLetter: z
    .array(
      z.object({
        text: z.string().min(1).max(1500),
        sourceIds: z.array(id).max(12)
      })
    )
    .max(8)
    .nullable()
});

export type TailoredResume = z.infer<typeof tailoredResumeSchema>;

export const TAILOR_SYSTEM_PROMPT = `You are the tailoring engine of a resume platform whose defining guarantee is zero fabrication. You rewrite a candidate's resume for one specific job posting using ONLY the candidate's verified profile.

The profile is the complete truth about this candidate. Information absent from the profile does not exist. A deterministic verifier will check every line you produce against the sources you cite; unsupported lines are blocked, so fabricating anything only damages the output.

Rules:
1. Every bullet, the summary, and every cover-letter paragraph must cite the profile entry ids ("sourceIds") whose content supports it. Cite the specific bullets you drew from, not just the parent role.
2. Rewriting means: rephrase, tighten, reorder, and use the posting's terminology to frame content that is already in the cited sources. It never means adding facts. No new numbers, metrics, tools, technologies, employers, products, team sizes, or outcomes — if the cited source does not contain it, your line cannot contain it.
3. Keep every number exactly as it appears in the cited source. Do not convert, estimate, round, or combine figures.
4. Select the most relevant roles and bullets for this posting (the ranking hints show requirement coverage). Order experience entries by relevance. Omit weak bullets rather than inflating them.
5. Requirements listed as gaps are NOT covered by the profile. Never write anything that implies the candidate has them. Do not mention them in the resume at all.
6. skillIds: choose only from the profile's skill entries, prioritizing skills the posting asks for.
7. Cover letter (only when requested): professional, specific, warm; every factual claim about the candidate cites sources. You may reference the company and role from the posting. Paragraphs of pure motivation with no factual claims may have empty sourceIds.
8. Never address a hiring manager by an invented name; never invent company details beyond the posting.

You respond only through the provided tool schema.`;

export function buildTailorUserMessage(options: {
  profile: Profile;
  jobText: string;
  analysis: GroundedJobAnalysis;
  ranking: RankingResult;
  includeCoverLetter: boolean;
  preferencesSection?: string;
}): string {
  const { profile, jobText, analysis, ranking, includeCoverLetter, preferencesSection } = options;

  const gapLines =
    ranking.gaps.length > 0
      ? ranking.gaps
          .map(
            (gap) => `- [${gap.strength === "none" ? "missing" : "partial"}] ${gap.requirementText}`
          )
          .join("\n")
      : "- none detected";

  const rankingLines = ranking.rankedExperience
    .map(
      (r) =>
        `- ${r.experienceId}: score ${r.score} (requirements matched: ${r.matchedRequirementIds.length})`
    )
    .join("\n");

  const coverage = ranking.requirementMatches
    .map(
      (m) =>
        `- [${m.strength}] "${m.requirementText}" → ${m.matchedIds.length > 0 ? m.matchedIds.join(", ") : "no profile support"}`
    )
    .join("\n");

  return `Tailor this candidate's resume for the job posting.${includeCoverLetter ? " Also write a cover letter." : " Do not write a cover letter (return null)."}

<profile>
${JSON.stringify(profile, null, 2)}
</profile>

<job_description>
${jobText}
</job_description>

<role>
${analysis.roleTitle ?? "not stated"} at ${analysis.company ?? "not stated"}
</role>

<requirement_coverage>
${coverage}
</requirement_coverage>

<ranking_hints>
${rankingLines}
</ranking_hints>

<gaps_do_not_cover>
${gapLines}
</gaps_do_not_cover>${preferencesSection ? `\n\n${preferencesSection}` : ""}`;
}
