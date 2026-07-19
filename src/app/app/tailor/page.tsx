import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfile } from "@/lib/profile/service";
import { countUserDecisions, listTailorings } from "@/lib/tailor/service";
import { TailorClient } from "./tailor-client";

export const metadata: Metadata = { title: "Tailor" };

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

export default async function TailorPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const [stored, recent, decisionCount] = await Promise.all([
    getProfile(user.id),
    listTailorings(user.id),
    countUserDecisions(user.id)
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tailor your resume</h1>
        <p className="mt-1 text-ink-soft">
          Paste a job description. TrueTailor rewrites your resume for it — every line cited to your
          profile, every claim verified, every gap stated honestly.
        </p>
        {decisionCount > 0 ? (
          <p className="mt-2 text-sm text-accent">
            Personalized: adapting to the {decisionCount} review decision
            {decisionCount === 1 ? "" : "s"} you&apos;ve made — style only; verification rules never
            relax.
          </p>
        ) : null}
      </div>

      {!stored ? (
        <div className="rounded-xl border border-line bg-surface p-8 text-center">
          <p className="font-medium">You need a master resume first.</p>
          <p className="mt-1 text-sm text-ink-soft">
            Import your resume once; then tailor it to any number of jobs.
          </p>
          <Link
            href="/app/resume"
            className="mt-4 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
          >
            Import resume
          </Link>
        </div>
      ) : (
        <TailorClient />
      )}

      {recent.length > 0 ? (
        <section
          aria-label="Recent tailorings"
          className="rounded-xl border border-line bg-surface p-6"
        >
          <h2 className="text-lg font-semibold tracking-tight">Recent tailorings</h2>
          <ul className="mt-4 divide-y divide-line">
            {recent.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/app/tailor/${item.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm transition-colors hover:text-accent"
                >
                  <span className="font-medium">
                    {item.roleTitle ?? "Untitled role"}
                    {item.company ? (
                      <span className="font-normal text-ink-soft"> · {item.company}</span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-ink-soft">
                    {item.valid ? (
                      <span className="text-success">verified</span>
                    ) : (
                      <span className="text-danger">{item.unsupportedCount} blocked</span>
                    )}
                    <span>
                      {item.gapCount} gap{item.gapCount === 1 ? "" : "s"}
                    </span>
                    <span>{dateFormat.format(item.createdAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
