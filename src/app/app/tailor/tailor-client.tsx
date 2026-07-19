"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { TailorResult, type TailoringView } from "./tailor-result";

export function TailorClient() {
  const router = useRouter();
  const [jobText, setJobText] = useState("");
  const [coverLetter, setCoverLetter] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<TailoringView | null>(null);
  const textId = useId();
  const coverId = useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tailor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobText, coverLetter })
      });
      const payload = (await res.json().catch(() => null)) as
        (TailoringView & { error?: string }) | null;
      if (!res.ok || !payload?.result) {
        setError(payload?.error ?? "Tailoring failed. Please try again.");
        return;
      }
      setView(payload);
      router.refresh(); // refresh the recent-tailorings list
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="rounded-xl border border-line bg-surface p-6">
        <label htmlFor={textId} className="block text-sm font-medium">
          Job description
        </label>
        <textarea
          id={textId}
          rows={10}
          required
          minLength={80}
          value={jobText}
          onChange={(e) => setJobText(e.target.value)}
          aria-describedby={`${textId}-help`}
          className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
        <p id={`${textId}-help`} className="mt-1 text-xs text-ink-soft">
          Paste the full posting — requirements, responsibilities, qualifications.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <input
              id={coverId}
              type="checkbox"
              checked={coverLetter}
              onChange={(e) => setCoverLetter(e.target.checked)}
              className="h-4 w-4 rounded border-line"
            />
            <label htmlFor={coverId} className="text-sm">
              Also draft a cover letter
            </label>
          </div>
          <button
            type="submit"
            disabled={busy || jobText.trim().length < 80}
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Tailoring…" : "Tailor my resume"}
          </button>
        </div>
      </form>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      ) : null}
      <p role="status" aria-live="polite" className={busy ? "text-sm text-ink-soft" : "sr-only"}>
        {busy
          ? "Analyzing the posting, ranking your experience, generating grounded content, and verifying every claim — this can take up to a minute."
          : ""}
      </p>

      {view ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft px-5 py-4">
            <p className="text-sm">
              <span className="font-semibold">Tailoring saved.</span> Review each line, resolve
              anything blocked, and export from the review workspace.
            </p>
            <a
              href={`/app/tailor/${view.id}`}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
            >
              Open review &amp; export
            </a>
          </div>
          <TailorResult view={view} />
        </>
      ) : null}
    </div>
  );
}
