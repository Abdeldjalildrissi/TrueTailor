import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDecisions, getTailoring } from "@/lib/tailor/service";
import { ReviewWorkspace } from "./review-workspace";

export const metadata: Metadata = { title: "Review & export" };

const strengthStyles: Record<string, string> = {
  full: "bg-success-soft text-success border-success/30",
  partial: "bg-accent-soft text-accent border-accent/30",
  none: "bg-danger-soft text-danger border-danger/30"
};

const strengthLabels: Record<string, string> = {
  full: "Covered",
  partial: "Partial",
  none: "Missing"
};

export default async function TailoringDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const { id } = await params;
  const [record, decisions] = await Promise.all([
    getTailoring(user.id, id),
    getDecisions(user.id, id)
  ]);
  if (!record) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {record.roleTitle ?? "Tailored resume"}
            {record.company ? (
              <span className="font-normal text-ink-soft"> · {record.company}</span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Created{" "}
            {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
              record.createdAt
            )}{" "}
            · built from profile v{record.profileVersion}
          </p>
        </div>
        <Link
          href="/app/tailor"
          className="rounded-md border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-ink-soft"
        >
          New tailoring
        </Link>
      </div>

      <section
        aria-label="Requirement coverage"
        className="rounded-xl border border-line bg-surface p-6"
      >
        <h2 className="text-lg font-semibold tracking-tight">Requirement coverage</h2>
        <ul className="mt-4 space-y-2">
          {record.ranking.requirementMatches.map((match) => (
            <li
              key={match.requirementId}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-line px-4 py-2.5 text-sm"
            >
              <span className="max-w-[46rem]">{match.requirementText}</span>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${strengthStyles[match.strength]}`}
              >
                {strengthLabels[match.strength]}
              </span>
            </li>
          ))}
          {record.ranking.requirementMatches.length === 0 ? (
            <li className="text-sm text-ink-soft">No discrete requirements identified.</li>
          ) : null}
        </ul>
      </section>

      <ReviewWorkspace
        tailoringId={record.id}
        profile={record.profile}
        result={record.result}
        verification={record.verification}
        initialDecisions={decisions}
      />
    </div>
  );
}
