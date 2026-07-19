"use client";

import { useId, useRef, useState } from "react";
import type { GroundingWarning } from "@/lib/profile/grounding";
import type { Profile, ProfileInput } from "@/lib/profile/schema";
import {
  BasicsEditor,
  CompactListEditor,
  EducationEditor,
  ExperienceEditor,
  ProjectsEditor,
  SkillsEditor,
  SummaryEditor
} from "./section-editors";
import { Button } from "./ui";

/* ---------- import panel ---------- */

function ImportPanel({
  emphasized,
  busy,
  onImport
}: {
  emphasized: boolean;
  busy: boolean;
  onImport: (body: FormData | { text: string }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState("");
  const fileId = useId();
  const pasteId = useId();

  function submitFile(event: React.FormEvent) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      return;
    }
    const form = new FormData();
    form.append("file", file);
    onImport(form);
  }

  function submitPaste(event: React.FormEvent) {
    event.preventDefault();
    if (pasted.trim().length === 0) {
      return;
    }
    onImport({ text: pasted });
  }

  return (
    <div className={emphasized ? "rounded-xl border border-line bg-surface p-8" : ""}>
      {emphasized ? (
        <>
          <h2 className="text-lg font-semibold tracking-tight">Import your resume</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Upload a PDF, DOCX, Markdown, or plain-text resume. TrueTailor converts it into your
            master profile — and anything the AI extracts that cannot be verified against your
            document is excluded and reported, never silently kept.
          </p>
        </>
      ) : null}

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <form onSubmit={submitFile} aria-label="Upload a resume file">
          <label htmlFor={fileId} className="block text-sm font-medium">
            Resume file
          </label>
          <input
            ref={fileRef}
            id={fileId}
            type="file"
            accept=".pdf,.docx,.md,.markdown,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-accent-soft file:px-3 file:py-1 file:text-sm file:font-medium file:text-accent"
          />
          <p className="mt-1 text-xs text-ink-soft">PDF, DOCX, Markdown, or TXT — up to 5 MB.</p>
          <div className="mt-3">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Importing…" : "Import file"}
            </Button>
          </div>
        </form>

        <form onSubmit={submitPaste} aria-label="Paste resume text">
          <label htmlFor={pasteId} className="block text-sm font-medium">
            Or paste resume text
          </label>
          <textarea
            id={pasteId}
            rows={5}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
          />
          <div className="mt-3">
            <Button type="submit" disabled={busy || pasted.trim().length === 0}>
              {busy ? "Importing…" : "Import pasted text"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------- main manager ---------- */

interface ResumeManagerProps {
  initialProfile: Profile | null;
  initialWarnings: GroundingWarning[];
  initialVersion: number;
}

export function ResumeManager({
  initialProfile,
  initialWarnings,
  initialVersion
}: ResumeManagerProps) {
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [warnings, setWarnings] = useState<GroundingWarning[]>(initialWarnings);
  const [version, setVersion] = useState(initialVersion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function importResume(body: FormData | { text: string }) {
    setBusy(true);
    setError(null);
    setStatus(
      "Importing — parsing your document and extracting a verified profile. This can take up to a minute."
    );
    try {
      const res = await fetch("/api/resume/import", {
        method: "POST",
        ...(body instanceof FormData
          ? { body }
          : {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body)
            })
      });
      const payload = (await res.json().catch(() => null)) as {
        profile?: Profile;
        warnings?: GroundingWarning[];
        version?: number;
        error?: string;
      } | null;
      if (!res.ok || !payload?.profile) {
        setError(payload?.error ?? "Import failed. Please try again.");
        setStatus(null);
        return;
      }
      setProfile(payload.profile);
      setWarnings(payload.warnings ?? []);
      setVersion(payload.version ?? 1);
      setStatus(
        "Resume imported. Review the extracted profile below — it is now your source of truth."
      );
    } catch {
      setError("Network error during import. Please try again.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(input: ProfileInput): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      const payload = (await res.json().catch(() => null)) as {
        profile?: Profile;
        version?: number;
        error?: string;
        details?: { path: string; message: string }[];
      } | null;
      if (!res.ok || !payload?.profile) {
        const detail = payload?.details?.[0];
        setError(
          detail
            ? `${payload?.error ?? "Save failed."} ${detail.path}: ${detail.message}`
            : (payload?.error ?? "Save failed. Please try again.")
        );
        return false;
      }
      setProfile(payload.profile);
      setVersion(payload.version ?? version + 1);
      setStatus("Profile saved.");
      return true;
    } catch {
      setError("Network error while saving. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Master resume</h1>
          <p className="mt-1 text-ink-soft">
            The verified source of truth every tailored resume is built from.
          </p>
        </div>
        {profile ? (
          <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-soft">
            Version {version}
          </span>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        className={
          status
            ? "rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink-soft"
            : "sr-only"
        }
      >
        {status ?? ""}
      </p>

      {warnings.length > 0 ? (
        <details className="rounded-md border border-danger/20 bg-danger-soft/60 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-danger">
            {warnings.length} extracted item{warnings.length === 1 ? " was" : "s were"} excluded —
            could not be verified against your document
          </summary>
          <ul className="mt-3 space-y-2">
            {warnings.map((warning, index) => (
              <li key={index} className="rounded border border-danger/20 bg-surface px-3 py-2">
                <span className="font-medium">{warning.section}:</span>{" "}
                <span className="text-ink-soft">“{warning.value}”</span>{" "}
                <span className="text-danger">— {warning.reason}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-soft">
            If any of these are real, add them manually below — entries you author yourself are
            treated as verified.
          </p>
        </details>
      ) : null}

      {!profile ? (
        <ImportPanel emphasized busy={busy} onImport={importResume} />
      ) : (
        <>
          <BasicsEditor profile={profile} busy={busy} onSave={saveProfile} />
          <SummaryEditor profile={profile} busy={busy} onSave={saveProfile} />
          <ExperienceEditor profile={profile} busy={busy} onSave={saveProfile} />
          <EducationEditor profile={profile} busy={busy} onSave={saveProfile} />
          <SkillsEditor profile={profile} busy={busy} onSave={saveProfile} />
          <CompactListEditor
            kind="certifications"
            profile={profile}
            busy={busy}
            onSave={saveProfile}
          />
          <ProjectsEditor profile={profile} busy={busy} onSave={saveProfile} />
          <CompactListEditor kind="awards" profile={profile} busy={busy} onSave={saveProfile} />
          <CompactListEditor kind="languages" profile={profile} busy={busy} onSave={saveProfile} />

          <details className="rounded-xl border border-line bg-surface p-6">
            <summary className="cursor-pointer font-semibold">Replace resume</summary>
            <p className="mt-2 text-sm text-ink-soft">
              Importing a new document regenerates your profile from scratch (a new version). Your
              current profile is replaced.
            </p>
            <ImportPanel emphasized={false} busy={busy} onImport={importResume} />
          </details>
        </>
      )}
    </div>
  );
}
