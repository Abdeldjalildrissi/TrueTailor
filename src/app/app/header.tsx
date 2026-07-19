"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface AppHeaderProps {
  displayName: string;
  email: string;
}

export function AppHeader({ displayName, email }: AppHeaderProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/app" className="text-lg font-semibold tracking-tight">
            TrueTailor
          </Link>
          <nav
            aria-label="Workspace"
            className="flex items-center gap-4 text-sm font-medium text-ink-soft"
          >
            <Link href="/app/resume" className="transition-colors hover:text-ink">
              Resume
            </Link>
            <Link href="/app/tailor" className="transition-colors hover:text-ink">
              Tailor
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span
            className="hidden text-sm text-ink-soft sm:block"
            aria-label={`Signed in as ${email}`}
          >
            {displayName}
          </span>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-ink-soft hover:text-ink disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </header>
  );
}
