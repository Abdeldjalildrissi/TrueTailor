import { desc, eq } from "drizzle-orm";
import { getProvider } from "@/lib/ai";
import { toJsonSchema } from "@/lib/ai/json-schema";
import { getDb } from "@/lib/db";
import { jobs, tailoringDecisions, tailorings } from "@/lib/db/schema";
import { decidablePaths, type LineDecision } from "@/lib/export/assemble";
import {
  buildPreferencesPromptSection,
  derivePreferences,
  type DecisionHistoryItem
} from "@/lib/learn/preferences";
import { newEntityId, type Profile } from "@/lib/profile/schema";
import { getProfile } from "@/lib/profile/service";
import {
  buildTailorUserMessage,
  TAILOR_SYSTEM_PROMPT,
  tailoredResumeSchema,
  type TailoredResume
} from "./generate";
import {
  buildJobAnalysisUserMessage,
  groundJobAnalysis,
  JOB_ANALYSIS_SYSTEM_PROMPT,
  jobAnalysisSchema,
  type GroundedJobAnalysis
} from "./job-analysis";
import { rankProfile, type RankingResult } from "./rank";
import { verifyTailoredResume, type VerificationReport } from "./verify";

export class NoProfileError extends Error {
  constructor() {
    super("Import or create your master resume before tailoring.");
    this.name = "NoProfileError";
  }
}

export interface TailoringRecord {
  id: string;
  jobId: string;
  roleTitle: string | null;
  company: string | null;
  jobText: string;
  profileVersion: number;
  analysis: GroundedJobAnalysis;
  ranking: RankingResult;
  result: TailoredResume;
  verification: VerificationReport;
  profile: Profile;
  createdAt: Date;
}

const jobAnalysisJsonSchema = toJsonSchema(jobAnalysisSchema);
const tailoredJsonSchema = toJsonSchema(tailoredResumeSchema);

/**
 * Sanitizes the generated result against the profile: entries referencing
 * unknown experience ids are dropped outright (structural), duplicates
 * collapse, and skill ids are filtered to real skills. Prose support is then
 * judged by the deterministic verifier.
 */
export function sanitizeTailored(profile: Profile, tailored: TailoredResume): TailoredResume {
  const experienceIds = new Set(profile.experience.map((e) => e.id));
  const skillIds = new Set(profile.skills.map((s) => s.id));
  const seenExperience = new Set<string>();

  return {
    summary: tailored.summary,
    experience: tailored.experience.filter((entry) => {
      if (!experienceIds.has(entry.experienceId) || seenExperience.has(entry.experienceId)) {
        return false;
      }
      seenExperience.add(entry.experienceId);
      return true;
    }),
    skillIds: [...new Set(tailored.skillIds)].filter((id) => skillIds.has(id)),
    coverLetter: tailored.coverLetter
  };
}

export async function tailorResume(
  userId: string,
  jobText: string,
  options: { coverLetter: boolean }
): Promise<TailoringRecord> {
  const stored = await getProfile(userId);
  if (!stored || (stored.profile.experience.length === 0 && stored.profile.skills.length === 0)) {
    throw new NoProfileError();
  }
  const profile = stored.profile;
  const provider = getProvider();

  // Stage 1: analyze the posting, then ground the analysis against it.
  const rawAnalysis = await provider.generateStructured({
    system: JOB_ANALYSIS_SYSTEM_PROMPT,
    user: buildJobAnalysisUserMessage(jobText),
    schemaName: "job_analysis",
    schema: jobAnalysisSchema,
    jsonSchema: jobAnalysisJsonSchema,
    maxOutputTokens: 4096
  });
  const analysis = groundJobAnalysis(rawAnalysis, jobText, newEntityId);

  // Stage 2: deterministic ranking and gap detection.
  const ranking = rankProfile(profile, analysis.requirements);

  // Learned style preferences from past review decisions (Phase 4). Style
  // and selection guidance only — the verifier still checks every line.
  const history = await getDecisionHistory(userId, 100);
  const preferencesSection = buildPreferencesPromptSection(derivePreferences(history));

  // Stage 3: grounded generation.
  const rawResult = await provider.generateStructured({
    system: TAILOR_SYSTEM_PROMPT,
    user: buildTailorUserMessage({
      profile,
      jobText,
      analysis,
      ranking,
      includeCoverLetter: options.coverLetter,
      preferencesSection
    }),
    schemaName: "tailored_resume",
    schema: tailoredResumeSchema,
    jsonSchema: tailoredJsonSchema,
    maxOutputTokens: 8192
  });
  const result = sanitizeTailored(profile, rawResult);

  // Stage 4: deterministic verification of every claim.
  const verification = verifyTailoredResume(profile, result, jobText);

  // Persist job + tailoring.
  const db = await getDb();
  const now = new Date();
  const jobId = newEntityId();
  await db.insert(jobs).values({
    id: jobId,
    userId,
    roleTitle: analysis.roleTitle,
    company: analysis.company,
    rawText: jobText,
    createdAt: now
  });
  const tailoringId = newEntityId();
  await db.insert(tailorings).values({
    id: tailoringId,
    userId,
    jobId,
    profileVersion: stored.version,
    analysis,
    ranking,
    result,
    verification,
    createdAt: now,
    updatedAt: now
  });

  return {
    id: tailoringId,
    jobId,
    roleTitle: analysis.roleTitle,
    company: analysis.company,
    jobText,
    profileVersion: stored.version,
    analysis,
    ranking,
    result,
    verification,
    profile,
    createdAt: now
  };
}

export interface TailoringSummary {
  id: string;
  roleTitle: string | null;
  company: string | null;
  valid: boolean;
  unsupportedCount: number;
  gapCount: number;
  createdAt: Date;
}

export async function listTailorings(userId: string): Promise<TailoringSummary[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: tailorings.id,
      verification: tailorings.verification,
      ranking: tailorings.ranking,
      createdAt: tailorings.createdAt,
      roleTitle: jobs.roleTitle,
      company: jobs.company
    })
    .from(tailorings)
    .innerJoin(jobs, eq(tailorings.jobId, jobs.id))
    .where(eq(tailorings.userId, userId))
    .orderBy(desc(tailorings.createdAt))
    .limit(50);

  return rows.map((row) => {
    const verification = row.verification as VerificationReport;
    const ranking = row.ranking as RankingResult;
    return {
      id: row.id,
      roleTitle: row.roleTitle,
      company: row.company,
      valid: verification.valid,
      unsupportedCount: verification.unsupportedCount,
      gapCount: ranking.gaps.length,
      createdAt: row.createdAt
    };
  });
}

export async function getTailoring(userId: string, id: string): Promise<TailoringRecord | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(tailorings)
    .innerJoin(jobs, eq(tailorings.jobId, jobs.id))
    .where(eq(tailorings.id, id));
  const row = rows[0];
  if (!row || row.tailorings.userId !== userId) {
    return null;
  }
  const stored = await getProfile(userId);
  if (!stored) {
    return null;
  }
  return {
    id: row.tailorings.id,
    jobId: row.jobs.id,
    roleTitle: row.jobs.roleTitle,
    company: row.jobs.company,
    jobText: row.jobs.rawText,
    profileVersion: row.tailorings.profileVersion,
    analysis: row.tailorings.analysis as GroundedJobAnalysis,
    ranking: row.tailorings.ranking as RankingResult,
    result: tailoredResumeSchema.parse(row.tailorings.result),
    verification: row.tailorings.verification as VerificationReport,
    profile: stored.profile,
    createdAt: row.tailorings.createdAt
  };
}

/* ---------- review decisions ---------- */

export class DecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionError";
  }
}

async function requireOwnedTailoring(userId: string, tailoringId: string) {
  const db = await getDb();
  const rows = await db.select().from(tailorings).where(eq(tailorings.id, tailoringId));
  const row = rows[0];
  if (!row || row.userId !== userId) {
    return null;
  }
  return row;
}

/**
 * Upserts per-line review decisions (accept / reject / edit). Paths are
 * validated against the stored generation so decisions can never dangle.
 * Edited text is user-authored content and takes authorship of the line.
 */
export async function saveDecisions(
  userId: string,
  tailoringId: string,
  items: LineDecision[]
): Promise<LineDecision[]> {
  const row = await requireOwnedTailoring(userId, tailoringId);
  if (!row) {
    throw new DecisionError("Tailoring not found.");
  }
  const result = tailoredResumeSchema.parse(row.result);
  const validPaths = decidablePaths(result);
  for (const item of items) {
    if (!validPaths.has(item.claimPath)) {
      throw new DecisionError(`Unknown line path: ${item.claimPath}`);
    }
    if (item.action === "edit" && (!item.editedText || item.editedText.trim().length === 0)) {
      throw new DecisionError("Edited lines need replacement text.");
    }
  }

  const db = await getDb();
  const now = new Date();
  for (const item of items) {
    await db
      .insert(tailoringDecisions)
      .values({
        id: newEntityId(),
        tailoringId,
        userId,
        claimPath: item.claimPath,
        action: item.action,
        editedText: item.action === "edit" ? (item.editedText?.trim() ?? null) : null,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [tailoringDecisions.tailoringId, tailoringDecisions.claimPath],
        set: {
          action: item.action,
          editedText: item.action === "edit" ? (item.editedText?.trim() ?? null) : null,
          updatedAt: now
        }
      });
  }
  return getDecisions(userId, tailoringId);
}

export async function getDecisions(userId: string, tailoringId: string): Promise<LineDecision[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(tailoringDecisions)
    .where(eq(tailoringDecisions.tailoringId, tailoringId));
  return rows
    .filter((row) => row.userId === userId)
    .map((row) => ({
      claimPath: row.claimPath,
      action: row.action,
      editedText: row.editedText
    }));
}

/* ---------- learning: decision history ---------- */

/**
 * Cross-tailoring review history for this user, most recent first, with each
 * decision resolved back to the generated line it applied to. This is the
 * raw material for learned style preferences (Phase 4).
 */
export async function getDecisionHistory(
  userId: string,
  limit = 100
): Promise<DecisionHistoryItem[]> {
  const db = await getDb();
  const rows = await db
    .select({
      claimPath: tailoringDecisions.claimPath,
      action: tailoringDecisions.action,
      editedText: tailoringDecisions.editedText,
      updatedAt: tailoringDecisions.updatedAt,
      result: tailorings.result
    })
    .from(tailoringDecisions)
    .innerJoin(tailorings, eq(tailoringDecisions.tailoringId, tailorings.id))
    .where(eq(tailoringDecisions.userId, userId))
    .orderBy(desc(tailoringDecisions.updatedAt))
    .limit(limit);

  const parsedCache = new Map<unknown, TailoredResume>();
  const resolveText = (result: unknown, claimPath: string): string | null => {
    let parsed = parsedCache.get(result);
    if (!parsed) {
      const attempt = tailoredResumeSchema.safeParse(result);
      if (!attempt.success) {
        return null;
      }
      parsed = attempt.data;
      parsedCache.set(result, parsed);
    }
    if (claimPath === "summary") {
      return parsed.summary?.text ?? null;
    }
    const experienceMatch = /^experience\[(\d+)\]\.bullets\[(\d+)\]$/.exec(claimPath);
    if (experienceMatch) {
      const entry = parsed.experience[Number(experienceMatch[1])];
      return entry?.bullets[Number(experienceMatch[2])]?.text ?? null;
    }
    const coverMatch = /^coverLetter\[(\d+)\]$/.exec(claimPath);
    if (coverMatch) {
      return parsed.coverLetter?.[Number(coverMatch[1])]?.text ?? null;
    }
    return null;
  };

  return rows.map((row) => ({
    action: row.action,
    generatedText: resolveText(row.result, row.claimPath),
    editedText: row.editedText,
    createdAt: row.updatedAt
  }));
}

/** Cheap count for UI copy ("adapts to your N review decisions"). */
export async function countUserDecisions(userId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ id: tailoringDecisions.id })
    .from(tailoringDecisions)
    .where(eq(tailoringDecisions.userId, userId));
  return rows.length;
}
