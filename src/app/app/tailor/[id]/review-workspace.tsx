"use client";

import { useMemo, useState } from "react";
import type { LineDecision } from "@/lib/export/assemble";
import type { Profile } from "@/lib/profile/schema";
import type { TailoredResume } from "@/lib/tailor/generate";
import type { VerificationReport } from "@/lib/tailor/verify";

interface ReviewWorkspaceProps {
  tailoringId: string;
  profile: Profile;
  result: TailoredResume;
  verification: VerificationReport;
  initialDecisions: LineDecision[];
}

type Status = "supported" | "unsupported";

interface LineModel {
  path: string;
  text: string;
  sourceIds: string[];
  status: Status;
  problems: string[];
  section: string;
  heading?: string;
}

function buildSourceTexts(profile: Profile): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of profile.experience) {
    map.set(e.id, `${e.title} — ${e.employer}`);
    for (const b of e.bullets) {
      map.set(b.id, b.text);
    }
  }
  for (const e of profile.education) {
    map.set(e.id, `${e.institution}${e.degree ? ` — ${e.degree}` : ""}`);
    for (const d of e.details) {
      map.set(d.id, d.text);
    }
  }
  for (const s of profile.skills) {
    map.set(s.id, `Skill: ${s.name}`);
  }
  for (const c of profile.certifications) {
    map.set(c.id, `Certification: ${c.name}`);
  }
  for (const p of profile.projects) {
    map.set(p.id, `Project: ${p.name}`);
    for (const b of p.bullets) {
      map.set(b.id, b.text);
    }
  }
  if (profile.summary) {
    map.set(profile.summary.id, profile.summary.text);
  }
  return map;
}

export function ReviewWorkspace({
  tailoringId,
  profile,
  result,
  verification,
  initialDecisions
}: ReviewWorkspaceProps) {
  const [decisions, setDecisions] = useState<Map<string, LineDecision>>(
    () => new Map(initialDecisions.map((d) => [d.claimPath, d]))
  );
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);

  const sourceTexts = useMemo(() => buildSourceTexts(profile), [profile]);
  const claimByPath = useMemo(
    () => new Map(verification.claims.map((c) => [c.path, c])),
    [verification]
  );
  const experienceById = useMemo(
    () => new Map(profile.experience.map((e) => [e.id, e])),
    [profile]
  );

  const lines = useMemo<LineModel[]>(() => {
    const all: LineModel[] = [];
    if (result.summary) {
      const claim = claimByPath.get("summary");
      all.push({
        path: "summary",
        text: result.summary.text,
        sourceIds: result.summary.sourceIds,
        status: claim?.status ?? "supported",
        problems: claim?.problems ?? [],
        section: "Summary"
      });
    }
    result.experience.forEach((entry, i) => {
      const source = experienceById.get(entry.experienceId);
      const heading = source ? `${source.title} — ${source.employer}` : "Role";
      entry.bullets.forEach((bullet, j) => {
        const path = `experience[${i}].bullets[${j}]`;
        const claim = claimByPath.get(path);
        all.push({
          path,
          text: bullet.text,
          sourceIds: bullet.sourceIds,
          status: claim?.status ?? "supported",
          problems: claim?.problems ?? [],
          section: "Experience",
          heading
        });
      });
    });
    (result.coverLetter ?? []).forEach((paragraph, i) => {
      const path = `coverLetter[${i}]`;
      const claim = claimByPath.get(path);
      all.push({
        path,
        text: paragraph.text,
        sourceIds: paragraph.sourceIds,
        status: claim?.status ?? "supported",
        problems: claim?.problems ?? [],
        section: "Cover letter"
      });
    });
    return all;
  }, [result, claimByPath, experienceById]);

  async function persist(decision: LineDecision) {
    setBusyPath(decision.claimPath);
    setError(null);
    try {
      const res = await fetch(`/api/tailorings/${tailoringId}/decisions`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decisions: [decision] })
      });
      const payload = (await res.json().catch(() => null)) as {
        decisions?: LineDecision[];
        error?: string;
      } | null;
      if (!res.ok || !payload?.decisions) {
        setError(payload?.error ?? "Could not save your decision. Please try again.");
        return;
      }
      setDecisions(new Map(payload.decisions.map((d) => [d.claimPath, d])));
    } catch {
      setError("Network error while saving your decision.");
    } finally {
      setBusyPath(null);
    }
  }

  function effectiveState(line: LineModel): {
    label: string;
    included: boolean;
    displayText: string;
    origin: "generated" | "edited";
  } {
    const decision = decisions.get(line.path);
    if (decision?.action === "reject") {
      return { label: "Rejected", included: false, displayText: line.text, origin: "generated" };
    }
    if (decision?.action === "edit" && decision.editedText) {
      return {
        label: "Edited by you",
        included: true,
        displayText: decision.editedText,
        origin: "edited"
      };
    }
    if (line.status === "unsupported") {
      return { label: "Blocked", included: false, displayText: line.text, origin: "generated" };
    }
    return { label: "Verified", included: true, displayText: line.text, origin: "generated" };
  }

  const includedCount = lines.filter((l) => effectiveState(l).included).length;
  const excludedCount = lines.length - includedCount;
  const hasCover = (result.coverLetter ?? []).length > 0;

  const exportButton = (format: string, label: string, doc: "resume" | "cover") => (
    <a
      key={`${doc}-${format}`}
      href={`/api/tailorings/${tailoringId}/export?format=${format}&doc=${doc}`}
      className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:border-ink-soft"
    >
      {label}
    </a>
  );

  let currentSection = "";

  return (
    <div className="space-y-6">
      <section aria-label="Export" className="rounded-xl border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Review &amp; export</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {includedCount} line{includedCount === 1 ? "" : "s"} will export
              {excludedCount > 0 ? ` · ${excludedCount} excluded (blocked or rejected)` : ""}.
              Blocked lines can be rewritten in your own words — you take authorship — or left out.
            </p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Download resume">
            {exportButton("pdf", "PDF", "resume")}
            {exportButton("docx", "DOCX", "resume")}
            {exportButton("markdown", "Markdown", "resume")}
            {exportButton("latex", "LaTeX", "resume")}
            {hasCover ? exportButton("pdf", "Cover letter PDF", "cover") : null}
            {hasCover ? exportButton("docx", "Cover letter DOCX", "cover") : null}
          </div>
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}

      <section
        aria-label="Line-by-line review"
        className="rounded-xl border border-line bg-surface p-6"
      >
        <h2 className="text-lg font-semibold tracking-tight">Line-by-line review</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Compare each rewritten line with the profile sources it cites, then accept, reject, or
          rewrite it.
        </p>

        <ul className="mt-5 space-y-4">
          {lines.map((line) => {
            const state = effectiveState(line);
            const decision = decisions.get(line.path);
            const isEditingThis = editingPath === line.path;
            const showHeading = line.section !== currentSection;
            currentSection = line.section;
            const blocked = line.status === "unsupported";

            return (
              <li key={line.path}>
                {showHeading ? (
                  <p className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wider text-ink-soft">
                    {line.section}
                  </p>
                ) : null}
                <div
                  className={`rounded-lg border p-4 ${
                    state.included ? "border-line" : "border-danger/30 bg-danger-soft/30"
                  }`}
                >
                  {line.heading ? (
                    <p className="text-xs font-medium text-ink-soft">{line.heading}</p>
                  ) : null}

                  {!isEditingThis ? (
                    <p
                      className={`mt-1 text-sm leading-relaxed ${state.included ? "" : "text-ink-soft line-through decoration-danger/50"}`}
                    >
                      {state.displayText}
                    </p>
                  ) : (
                    <div className="mt-2">
                      <label htmlFor={`edit-${line.path}`} className="block text-sm font-medium">
                        Rewrite in your own words
                      </label>
                      <textarea
                        id={`edit-${line.path}`}
                        rows={3}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
                      />
                      <p className="mt-1 text-xs text-ink-soft">
                        Edited lines are your words — you vouch for them, and they export as-is.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={busyPath === line.path || editText.trim().length === 0}
                          onClick={() => {
                            void persist({
                              claimPath: line.path,
                              action: "edit",
                              editedText: editText.trim()
                            });
                            setEditingPath(null);
                          }}
                          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-strong disabled:opacity-60"
                        >
                          Save rewrite
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPath(null)}
                          className="rounded-md border border-line px-3 py-1.5 text-sm font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        state.label === "Verified"
                          ? "border-success/30 bg-success-soft text-success"
                          : state.label === "Edited by you"
                            ? "border-accent/30 bg-accent-soft text-accent"
                            : "border-danger/30 bg-danger-soft text-danger"
                      }`}
                    >
                      {state.label}
                    </span>

                    {!blocked ? (
                      <button
                        type="button"
                        disabled={
                          busyPath === line.path ||
                          (!decision && state.included) ||
                          decision?.action === "accept"
                        }
                        onClick={() =>
                          void persist({ claimPath: line.path, action: "accept", editedText: null })
                        }
                        className="rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:border-ink-soft disabled:opacity-50"
                      >
                        Accept
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busyPath === line.path || decision?.action === "reject"}
                      onClick={() =>
                        void persist({ claimPath: line.path, action: "reject", editedText: null })
                      }
                      className="rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:border-ink-soft disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={busyPath === line.path}
                      onClick={() => {
                        setEditingPath(line.path);
                        setEditText(
                          decision?.action === "edit" && decision.editedText
                            ? decision.editedText
                            : line.text
                        );
                      }}
                      className="rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:border-ink-soft disabled:opacity-50"
                    >
                      {decision?.action === "edit" ? "Re-edit" : "Rewrite"}
                    </button>
                  </div>

                  {blocked && line.problems.length > 0 ? (
                    <ul className="mt-2 list-disc pl-5 text-xs text-danger">
                      {line.problems.map((problem, i) => (
                        <li key={i}>{problem}</li>
                      ))}
                    </ul>
                  ) : null}

                  <details className="mt-2 text-xs text-ink-soft">
                    <summary className="cursor-pointer font-medium">
                      Compare with{" "}
                      {line.sourceIds.length > 0
                        ? `${line.sourceIds.length} cited source${line.sourceIds.length === 1 ? "" : "s"}`
                        : "sources"}
                    </summary>
                    {line.sourceIds.length > 0 ? (
                      <ul className="mt-1.5 space-y-1">
                        {line.sourceIds.map((id) => (
                          <li
                            key={id}
                            className="rounded border border-line bg-paper px-2.5 py-1.5"
                          >
                            {sourceTexts.get(id) ?? `Unknown source (${id})`}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1.5">
                        No profile citations — this line makes no factual claims about you (allowed
                        for cover-letter prose grounded in the posting).
                      </p>
                    )}
                  </details>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
