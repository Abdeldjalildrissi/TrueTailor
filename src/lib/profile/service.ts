import { eq } from "drizzle-orm";
import { getProvider } from "@/lib/ai";
import { toJsonSchema } from "@/lib/ai/json-schema";
import { getDb } from "@/lib/db";
import { profiles, resumeDocuments } from "@/lib/db/schema";
import { parseResumeFile } from "@/lib/parse";
import {
  buildExtractionUserMessage,
  extractionSchema,
  EXTRACTION_SYSTEM_PROMPT,
  sanitizeExtraction,
  type Extraction
} from "./extraction";
import { verifyExtractionGrounded, type GroundingWarning } from "./grounding";
import { mergeExtractions } from "./merge";
import {
  materializeProfile,
  newEntityId,
  profileSchema,
  validateProfileRules,
  type Profile,
  type ProfileInput
} from "./schema";
import { chunkText } from "./text";

export interface StoredProfile {
  profile: Profile;
  warnings: GroundingWarning[];
  version: number;
  sourceDocumentId: string | null;
  updatedAt: Date;
}

export interface ImportResult extends StoredProfile {
  documentFilename: string;
}

export class ProfileValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: { path: string; message: string }[]
  ) {
    super(message);
    this.name = "ProfileValidationError";
  }
}

const extractionJsonSchema = toJsonSchema(extractionSchema);

/** Runs chunked structured extraction over a document's text. */
async function extractProfileFromText(rawText: string): Promise<Extraction> {
  const provider = getProvider();
  const chunks = chunkText(rawText);
  const parts: Extraction[] = [];
  for (const chunk of chunks) {
    const raw = await provider.generateStructured({
      system: EXTRACTION_SYSTEM_PROMPT,
      user: buildExtractionUserMessage(chunk),
      schemaName: "resume_extraction",
      schema: extractionSchema,
      jsonSchema: extractionJsonSchema,
      maxOutputTokens: 8192
    });
    parts.push(sanitizeExtraction(raw));
  }
  return mergeExtractions(parts);
}

function extractionToProfileInput(extraction: Extraction): ProfileInput {
  return {
    basics: {
      ...extraction.basics,
      email:
        extraction.basics.email && /.+@.+\..+/.test(extraction.basics.email)
          ? extraction.basics.email
          : null,
      links: extraction.basics.links.map((l) => ({ label: l.label, url: l.url }))
    },
    summary: extraction.summary ? { text: extraction.summary } : null,
    experience: extraction.experience.map((e) => ({
      employer: e.employer,
      title: e.title,
      location: e.location,
      startDate: e.startDate,
      endDate: e.isCurrent === true ? null : e.endDate,
      isCurrent: e.isCurrent === true,
      bullets: e.bullets.map((text) => ({ text }))
    })),
    education: extraction.education.map((e) => ({
      institution: e.institution,
      degree: e.degree,
      field: e.field,
      startDate: e.startDate,
      endDate: e.endDate,
      details: e.details.map((text) => ({ text }))
    })),
    skills: extraction.skills,
    certifications: extraction.certifications,
    projects: extraction.projects.map((p) => ({
      name: p.name,
      description: p.description,
      url: p.url,
      bullets: p.bullets.map((text) => ({ text }))
    })),
    awards: extraction.awards,
    languages: extraction.languages
  };
}

async function persistProfile(
  userId: string,
  profile: Profile,
  warnings: GroundingWarning[],
  sourceDocumentId: string | null
): Promise<StoredProfile> {
  const issues = validateProfileRules(profile);
  if (issues.length > 0) {
    throw new ProfileValidationError("Profile failed validation.", issues);
  }

  const db = await getDb();
  const now = new Date();
  const existing = await db
    .select({ id: profiles.id, version: profiles.version })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  const current = existing[0];

  if (current) {
    const version = current.version + 1;
    await db
      .update(profiles)
      .set({ data: profile, warnings, version, sourceDocumentId, updatedAt: now })
      .where(eq(profiles.id, current.id));
    return { profile, warnings, version, sourceDocumentId, updatedAt: now };
  }

  await db.insert(profiles).values({
    id: newEntityId(),
    userId,
    data: profile,
    warnings,
    version: 1,
    sourceDocumentId,
    createdAt: now,
    updatedAt: now
  });
  return { profile, warnings, version: 1, sourceDocumentId, updatedAt: now };
}

/**
 * Full import pipeline: parse → chunk → structured extraction → deterministic
 * merge → grounding verification (unsupported content removed and reported)
 * → id assignment → validation → persistence as a new profile version.
 */
export async function importResume(
  userId: string,
  file: { filename: string; mimeType: string | null; bytes: Uint8Array }
): Promise<ImportResult> {
  const parsed = await parseResumeFile(file.filename, file.mimeType, file.bytes);

  const db = await getDb();
  const documentId = newEntityId();
  await db.insert(resumeDocuments).values({
    id: documentId,
    userId,
    filename: file.filename,
    format: parsed.format,
    byteSize: file.bytes.byteLength,
    bytes: Buffer.from(file.bytes),
    rawText: parsed.text,
    createdAt: new Date()
  });

  const merged = await extractProfileFromText(parsed.text);
  const { extraction: grounded, warnings } = verifyExtractionGrounded(merged, parsed.text);
  const profile = materializeProfile(extractionToProfileInput(grounded));
  const stored = await persistProfile(userId, profile, warnings, documentId);

  return { ...stored, documentFilename: file.filename };
}

/** User-authored profile edit: validate, preserve stable ids, bump version. */
export async function updateProfile(userId: string, input: ProfileInput): Promise<StoredProfile> {
  const existing = await getProfile(userId);
  const materialized = materializeProfile(input);
  const withStableIds = existing ? preserveBulletIds(existing.profile, materialized) : materialized;
  return persistProfile(
    userId,
    withStableIds,
    existing?.warnings ?? [],
    existing?.sourceDocumentId ?? null
  );
}

export async function getProfile(userId: string): Promise<StoredProfile | null> {
  const db = await getDb();
  const rows = await db.select().from(profiles).where(eq(profiles.userId, userId));
  const row = rows[0];
  if (!row) {
    return null;
  }
  const profile = profileSchema.parse(row.data);
  return {
    profile,
    warnings: row.warnings,
    version: row.version,
    sourceDocumentId: row.sourceDocumentId,
    updatedAt: row.updatedAt
  };
}

/**
 * When an edited entry keeps the same text as before, keep the old bullet id
 * too — downstream tailoring references bullets by id, and unchanged content
 * should keep a stable identity across edits.
 */
function preserveBulletIds(previous: Profile, next: Profile): Profile {
  const textToId = new Map<string, string>();
  const collect = (bullets: { id: string; text: string }[]) => {
    for (const bullet of bullets) {
      const key = bullet.text.trim();
      if (!textToId.has(key)) {
        textToId.set(key, bullet.id);
      }
    }
  };
  previous.experience.forEach((e) => collect(e.bullets));
  previous.education.forEach((e) => collect(e.details));
  previous.projects.forEach((p) => collect(p.bullets));

  const usedIds = new Set<string>();
  const remap = (bullets: { id: string; text: string }[]) =>
    bullets.map((bullet) => {
      const preserved = textToId.get(bullet.text.trim());
      if (preserved && !usedIds.has(preserved)) {
        usedIds.add(preserved);
        return { id: preserved, text: bullet.text };
      }
      usedIds.add(bullet.id);
      return bullet;
    });

  return {
    ...next,
    experience: next.experience.map((e) => ({ ...e, bullets: remap(e.bullets) })),
    education: next.education.map((e) => ({ ...e, details: remap(e.details) })),
    projects: next.projects.map((p) => ({ ...p, bullets: remap(p.bullets) }))
  };
}
