import type { Profile } from "@/lib/profile/schema";
import type { GroundedJobAnalysis } from "@/lib/tailor/job-analysis";
import type { RankingResult } from "@/lib/tailor/rank";
import type { TailoredResume } from "@/lib/tailor/generate";
import type { VerificationReport } from "@/lib/tailor/verify";

export interface TailoringView {
  id: string;
  roleTitle: string | null;
  company: string | null;
  profileVersion: number;
  analysis: GroundedJobAnalysis;
  ranking: RankingResult;
  result: TailoredResume;
  verification: VerificationReport;
  profile: Profile;
}

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

function formatRange(start: string | null, end: string | null, isCurrent: boolean): string {
  const from = start ?? "…";
  const to = isCurrent ? "Present" : (end ?? "…");
  return `${from} — ${to}`;
}

/**
 * Pure presentational renderer for a tailoring record. Employer, title, and
 * dates are rendered from the PROFILE by id — generated text never carries
 * identity fields, so they cannot be fabricated.
 */
export function TailorResult({ view }: { view: TailoringView }) {
  const { profile, result, verification, ranking, analysis } = view;
  const experienceById = new Map(profile.experience.map((e) => [e.id, e]));
  const skillById = new Map(profile.skills.map((s) => [s.id, s]));
  const claimByPath = new Map(verification.claims.map((c) => [c.path, c]));

  const blockedClaims = verification.claims.filter((c) => c.status === "unsupported");

  return (
    <div className="space-y-6">
      {/* Verification banner */}
      {verification.valid ? (
        <div className="rounded-md border border-success/30 bg-success-soft px-4 py-3 text-sm text-success">
          <span className="font-semibold">Verified.</span> All {verification.claims.length}{" "}
          generated lines are supported by your profile.
        </div>
      ) : (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          <span className="font-semibold">
            {verification.unsupportedCount} line{verification.unsupportedCount === 1 ? "" : "s"}{" "}
            blocked.
          </span>{" "}
          The verifier could not trace {verification.unsupportedCount === 1 ? "it" : "them"} to your
          profile. Blocked lines are flagged below and will be excluded from exports.
        </div>
      )}

      {/* Requirement coverage */}
      <section
        aria-label="Requirement coverage"
        className="rounded-xl border border-line bg-surface p-6"
      >
        <h2 className="text-lg font-semibold tracking-tight">Requirement coverage</h2>
        <p className="mt-1 text-sm text-ink-soft">
          How your verified profile lines up against this posting — including what it honestly does
          not cover.
        </p>
        <ul className="mt-4 space-y-2">
          {ranking.requirementMatches.map((match) => (
            <li
              key={match.requirementId}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-line px-4 py-2.5 text-sm"
            >
              <span className="max-w-[46rem]">
                {match.requirementText}
                {match.kind === "nice" ? (
                  <span className="ml-2 text-xs text-ink-soft">(preferred)</span>
                ) : null}
              </span>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${strengthStyles[match.strength]}`}
              >
                {strengthLabels[match.strength]}
              </span>
            </li>
          ))}
          {ranking.requirementMatches.length === 0 ? (
            <li className="text-sm text-ink-soft">
              No discrete requirements were identified in this posting.
            </li>
          ) : null}
        </ul>
        {ranking.gaps.length > 0 ? (
          <p className="mt-4 rounded-md bg-paper px-4 py-3 text-sm text-ink-soft">
            <span className="font-medium text-ink">Honest gaps:</span>{" "}
            {ranking.gaps.filter((g) => g.strength === "none").length} requirement
            {ranking.gaps.filter((g) => g.strength === "none").length === 1 ? "" : "s"} your profile
            does not cover
            {ranking.gaps.some((g) => g.strength === "partial")
              ? ` (plus ${ranking.gaps.filter((g) => g.strength === "partial").length} with only partial support)`
              : ""}
            . The tailored resume does not pretend otherwise — consider addressing these in your
            application or interview.
          </p>
        ) : null}
      </section>

      {/* Tailored resume preview */}
      <section
        aria-label="Tailored resume"
        className="rounded-xl border border-line bg-surface p-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Tailored resume</h2>
          <p className="text-xs text-ink-soft">
            Built from profile v{view.profileVersion}
            {analysis.roleTitle ? ` for ${analysis.roleTitle}` : ""}
            {analysis.company ? ` at ${analysis.company}` : ""}
          </p>
        </div>

        <div className="mt-5 space-y-6">
          {profile.basics.fullName ? (
            <div>
              <p className="text-xl font-semibold">{profile.basics.fullName}</p>
              <p className="text-sm text-ink-soft">
                {[profile.basics.email, profile.basics.phone, profile.basics.location]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          ) : null}

          {result.summary ? (
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
                Summary
              </h3>
              <ClaimLine
                text={result.summary.text}
                claim={claimByPath.get("summary")}
                sourceCount={result.summary.sourceIds.length}
              />
            </div>
          ) : null}

          {result.experience.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
                Experience
              </h3>
              <div className="mt-2 space-y-5">
                {result.experience.map((entry, i) => {
                  const source = experienceById.get(entry.experienceId);
                  if (!source) {
                    return null;
                  }
                  return (
                    <article key={entry.experienceId}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-semibold">
                          {source.title} · <span className="font-normal">{source.employer}</span>
                        </p>
                        <p className="text-xs text-ink-soft">
                          {formatRange(source.startDate, source.endDate, source.isCurrent)}
                          {source.location ? ` · ${source.location}` : ""}
                        </p>
                      </div>
                      <ul className="mt-2 space-y-1.5">
                        {entry.bullets.map((bullet, j) => (
                          <ClaimLine
                            key={j}
                            asListItem
                            text={bullet.text}
                            claim={claimByPath.get(`experience[${i}].bullets[${j}]`)}
                            sourceCount={bullet.sourceIds.length}
                          />
                        ))}
                      </ul>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}

          {result.skillIds.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
                Skills to highlight
              </h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {result.skillIds.map((skillId) => {
                  const skill = skillById.get(skillId);
                  return skill ? (
                    <li
                      key={skillId}
                      className="rounded-full border border-line bg-paper px-3 py-1 text-sm"
                    >
                      {skill.name}
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      {/* Cover letter */}
      {result.coverLetter && result.coverLetter.length > 0 ? (
        <section aria-label="Cover letter" className="rounded-xl border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold tracking-tight">Cover letter</h2>
          <div className="mt-4 space-y-4">
            {result.coverLetter.map((paragraph, i) => (
              <ClaimLine
                key={i}
                text={paragraph.text}
                claim={claimByPath.get(`coverLetter[${i}]`)}
                sourceCount={paragraph.sourceIds.length}
                paragraph
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Blocked-claim detail */}
      {blockedClaims.length > 0 ? (
        <section
          aria-label="Blocked lines"
          className="rounded-xl border border-danger/30 bg-surface p-6"
        >
          <h2 className="text-lg font-semibold tracking-tight text-danger">Blocked lines</h2>
          <p className="mt-1 text-sm text-ink-soft">
            These generated lines could not be traced to your profile and are excluded from exports.
            If the underlying facts are real, add them to your master resume and tailor again.
          </p>
          <ul className="mt-4 space-y-3">
            {blockedClaims.map((claim) => (
              <li
                key={claim.path}
                className="rounded-lg border border-danger/20 bg-danger-soft/50 px-4 py-3 text-sm"
              >
                <p className="font-medium">“{claim.text}”</p>
                <ul className="mt-1.5 list-disc pl-5 text-xs text-danger">
                  {claim.problems.map((problem, i) => (
                    <li key={i}>{problem}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ClaimLine({
  text,
  claim,
  sourceCount,
  asListItem = false,
  paragraph = false
}: {
  text: string;
  claim?: { status: "supported" | "unsupported" };
  sourceCount: number;
  asListItem?: boolean;
  paragraph?: boolean;
}) {
  const blocked = claim?.status === "unsupported";
  const badge = blocked ? (
    <span className="ml-2 inline-block rounded-full border border-danger/30 bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger align-middle">
      blocked
    </span>
  ) : (
    <span
      className="ml-2 inline-block rounded-full border border-success/30 bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success align-middle"
      title={`Supported by ${sourceCount} profile source${sourceCount === 1 ? "" : "s"}`}
    >
      ✓ {sourceCount} source{sourceCount === 1 ? "" : "s"}
    </span>
  );

  const content = (
    <>
      <span className={blocked ? "text-ink-soft line-through decoration-danger/60" : ""}>
        {text}
      </span>
      {badge}
    </>
  );

  if (asListItem) {
    return <li className="text-sm leading-relaxed">{content}</li>;
  }
  return <p className={`text-sm leading-relaxed ${paragraph ? "" : "mt-1.5"}`}>{content}</p>;
}
