import { blob, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { GroundingWarning } from "@/lib/profile/grounding";
import type { Profile } from "@/lib/profile/schema";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

export const resumeDocuments = sqliteTable(
  "resume_documents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    format: text("format", { enum: ["pdf", "docx", "markdown", "text"] }).notNull(),
    byteSize: integer("byte_size").notNull(),
    bytes: blob("bytes", { mode: "buffer" }).notNull(),
    rawText: text("raw_text").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
  },
  (table) => [index("resume_documents_user_idx").on(table.userId)]
);

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  data: text("data", { mode: "json" }).$type<Profile>().notNull(),
  warnings: text("warnings", { mode: "json" }).$type<GroundingWarning[]>().notNull(),
  version: integer("version").notNull(),
  sourceDocumentId: text("source_document_id").references(() => resumeDocuments.id, {
    onDelete: "set null"
  }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleTitle: text("role_title"),
    company: text("company"),
    rawText: text("raw_text").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
  },
  (table) => [index("jobs_user_idx").on(table.userId)]
);

export const tailorings = sqliteTable(
  "tailorings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    profileVersion: integer("profile_version").notNull(),
    // JSON payloads are typed loosely here to avoid schema/runtime drift;
    // the service layer validates with Zod on write and read.
    analysis: text("analysis", { mode: "json" }).notNull(),
    ranking: text("ranking", { mode: "json" }).notNull(),
    result: text("result", { mode: "json" }).notNull(),
    verification: text("verification", { mode: "json" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
  },
  (table) => [
    index("tailorings_user_idx").on(table.userId),
    index("tailorings_job_idx").on(table.jobId)
  ]
);

export const tailoringDecisions = sqliteTable(
  "tailoring_decisions",
  {
    id: text("id").primaryKey(),
    tailoringId: text("tailoring_id")
      .notNull()
      .references(() => tailorings.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Path of the generated line this decision applies to, e.g.
    // "experience[0].bullets[2]", "summary", "coverLetter[1]".
    claimPath: text("claim_path").notNull(),
    action: text("action", { enum: ["accept", "reject", "edit"] }).notNull(),
    editedText: text("edited_text"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
  },
  (table) => [
    index("tailoring_decisions_tailoring_idx").on(table.tailoringId),
    uniqueIndex("tailoring_decisions_path_unique").on(table.tailoringId, table.claimPath)
  ]
);

export const sessions = sqliteTable(
  "sessions",
  {
    // Stores the SHA-256 hash of the bearer token — never the token itself,
    // so a database leak cannot be replayed as a session.
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull()
  },
  (table) => [index("sessions_user_idx").on(table.userId)]
);
