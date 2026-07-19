import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";

const principles = [
  {
    title: "Grounded generation",
    body: "Every tailored line references the entries in your master profile that support it. If it is not in your history, it does not go on the page."
  },
  {
    title: "Deterministic verification",
    body: "A server-side validator checks each generated claim against your profile before export. Claims that cannot be proven are blocked, not shipped."
  },
  {
    title: "Honest gaps",
    body: "When a job asks for something you do not have, TrueTailor says so — an explicit gap you can address, never an invented qualification."
  }
];

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/app");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">TrueTailor</span>
          <nav aria-label="Primary" className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-md px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
            >
              Create account
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-6 pb-16 pt-20">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            Resume tailoring without the fiction
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Tailored for every job. True to your experience.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">
            TrueTailor rewrites your resume for each job description — emphasizing what matters,
            speaking the role&apos;s language, and surfacing real gaps. It never invents employers,
            dates, skills, or achievements. Structurally, it can&apos;t.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/register"
              className="rounded-md bg-accent px-5 py-2.5 font-medium text-white transition-colors hover:bg-accent-strong"
            >
              Get started
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-line bg-surface px-5 py-2.5 font-medium text-ink transition-colors hover:border-ink-soft"
            >
              Sign in
            </Link>
          </div>
        </section>

        <section
          aria-label="How TrueTailor stays truthful"
          className="border-t border-line bg-surface"
        >
          <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-16 sm:grid-cols-3">
            {principles.map((principle) => (
              <div key={principle.title}>
                <h2 className="font-semibold">{principle.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{principle.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-5xl px-6 py-6 text-sm text-ink-soft">
          TrueTailor — grounded resume tailoring.
        </div>
      </footer>
    </div>
  );
}
