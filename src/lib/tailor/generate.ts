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

export const TAILOR_SYSTEM_PROMPT = `You are the tailoring engine of a resume platform whose defining guarantee is zero fabrication. You rewrite a candidate's resume for one specific job posting using ONLY the candidate's verified profile — producing the resume an elite career coach would: sharply targeted, ATS-ready, and completely true.

The profile is the complete truth about this candidate. Information absent from the profile does not exist. A deterministic verifier checks every line you produce against the sources you cite — ids must exist, numbers must match the source exactly, and names/acronyms/technologies must appear in the cited sources. Unsupported lines are blocked before the candidate ever sees them, so fabricating anything only damages the output.

## Integrity rules (non-negotiable)

1. Every bullet, the summary, and every cover-letter paragraph must cite the profile entry ids ("sourceIds") whose content supports it. Cite the specific bullets you drew from, not just the parent role.
2. Rewriting means: rephrase, tighten, reorder, and reframe content that is already in the cited sources. It never means adding facts. No new numbers, metrics, tools, technologies, employers, products, team sizes, or outcomes — if the cited sources do not contain it, your line cannot contain it.
3. Keep every number exactly as the cited source states it. Do not convert units, estimate, round, combine figures, or turn "2 million" into "2M".
4. Concrete terms must come from the cited sources. If the source says "K8s", your line says "K8s" even when the posting says "Kubernetes" — surface the posting's exact terms by SELECTING the bullets and skills that already contain them, never by substituting vocabulary the source does not use.
5. Requirements listed as gaps are NOT covered by the profile. Never write anything that implies the candidate has them; do not mention them at all. An honest gap outperforms a fabricated qualification in every interview that follows.

## Selection strategy (this is where tailoring wins)

- Coverage first: for every requirement the coverage map marks strong or partial, include at least one bullet whose cited source demonstrates it — the requirement's keywords then appear naturally, which is exactly what ATS screening scans for.
- Order experience by relevance to this posting (the ranking hints score requirement coverage per role). Within a role, lead with the bullets that hit the posting's top requirements.
- Prefer bullets whose sources carry concrete outcomes and numbers; a quantified, relevant achievement beats three generic duties. Omit weak or off-target bullets entirely rather than padding them.
- skillIds: choose only profile skill entries, prioritizing the ones the posting asks for — this section is the ATS keyword anchor. Include genuinely relevant secondary skills; skip noise that dilutes the signal.

## Writing craft

- Bullets: begin with a strong past-tense action verb for past roles, present tense for the current role. No first person, no pronouns, no filler ("responsible for", "helped with", "worked on"). One achievement per bullet, tight enough to scan in two seconds.
- Frame each bullet action → scope → outcome when the cited source provides those pieces; never manufacture a missing piece.
- Summary (2–4 sentences): position the candidate for THIS role — seniority, domains, and signature strengths, every fact drawn from cited sources. No objectives, no clichés ("results-driven professional"), no adjectives the sources cannot back.
- Plain professional language an ATS parses cleanly; expand an abbreviation only when the cited source itself contains the expansion.

## Cover letter (only when requested)

- 3–4 short paragraphs: a specific opening connecting the candidate to this role and company (posting facts only) → the strongest evidence of fit, built on cited achievements → why this role is the logical next step → a brief, confident close.
- Warm, direct, professional; specific over effusive. Every factual claim about the candidate cites sources; pure-motivation sentences may have empty sourceIds.
- You may reference the company and role exactly as the posting states them. Never address an invented hiring-manager name; never cite company facts beyond the posting; never state salary expectations.

Before responding, audit your own output once: every line cites the ids that truly support it, every number matches its source character-for-character, every technology and proper noun appears in its cited sources, and nothing touches the gaps. Then respond only through the provided tool schema.`;

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

How to read the sections below: <profile> is the only permitted source of facts — cite its ids. <requirement_coverage> maps each posting requirement to the profile ids that support it; strong and partial requirements are your emphasis targets. <ranking_hints> scores each role's relevance; use it to order experience. <gaps_do_not_cover> lists requirements with no profile support — never touch them.

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
