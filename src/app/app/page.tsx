import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfile } from "@/lib/profile/service";

export const metadata: Metadata = { title: "Workspace" };

const dateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric"
});

export default async function WorkspacePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const stored = await getProfile(user.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {user.displayName.split(" ")[0] ?? user.displayName}
        </h1>
        <p className="mt-1 text-ink-soft">
          {stored
            ? "Your master profile is ready — tailor it to any job description."
            : "Start by importing your resume to build your master profile."}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section
          aria-labelledby="resume-card-heading"
          className="rounded-xl border border-line bg-surface p-6"
        >
          <h2 id="resume-card-heading" className="font-semibold">
            Master resume
          </h2>
          {stored ? (
            <>
              <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-ink-soft">Roles</dt>
                  <dd className="mt-0.5 text-xl font-semibold">
                    {stored.profile.experience.length}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-soft">Skills</dt>
                  <dd className="mt-0.5 text-xl font-semibold">{stored.profile.skills.length}</dd>
                </div>
                <div>
                  <dt className="text-ink-soft">Version</dt>
                  <dd className="mt-0.5 text-xl font-semibold">{stored.version}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-ink-soft">
                Updated {dateFormat.format(stored.updatedAt)}
                {stored.warnings.length > 0
                  ? ` · ${stored.warnings.length} import exclusion${stored.warnings.length === 1 ? "" : "s"} to review`
                  : ""}
              </p>
              <Link
                href="/app/resume"
                className="mt-4 inline-block rounded-md border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-ink-soft"
              >
                Manage resume
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-ink-soft">
                Import a PDF, DOCX, Markdown, or text resume. TrueTailor converts it into a verified
                structured profile — the source of truth for every tailored version.
              </p>
              <Link
                href="/app/resume"
                className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
              >
                Import resume
              </Link>
            </>
          )}
        </section>

        <section
          aria-labelledby="tailor-card-heading"
          className="rounded-xl border border-line bg-surface p-6"
        >
          <h2 id="tailor-card-heading" className="font-semibold">
            Tailor for a job
          </h2>
          <p className="mt-2 text-sm text-ink-soft">
            Paste a job description and get a resume rewritten for it — every line cited to your
            profile, verified deterministically, with honest gaps.
          </p>
          <Link
            href="/app/tailor"
            className={
              stored
                ? "mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
                : "mt-4 inline-block rounded-md border border-line px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-ink-soft"
            }
          >
            {stored ? "Start tailoring" : "Tailor (import a resume first)"}
          </Link>
        </section>

        <section
          aria-labelledby="account-card-heading"
          className="rounded-xl border border-line bg-surface p-6"
        >
          <h2 id="account-card-heading" className="font-semibold">
            Account
          </h2>
          <dl className="mt-4 grid gap-4 text-sm">
            <div>
              <dt className="text-ink-soft">Email</dt>
              <dd className="mt-0.5 font-medium">{user.email}</dd>
            </div>
            <div>
              <dt className="text-ink-soft">Member since</dt>
              <dd className="mt-0.5 font-medium">{dateFormat.format(user.createdAt)}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
