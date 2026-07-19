"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface AuthFormProps {
  mode: "login" | "register";
}

const copy = {
  login: {
    heading: "Welcome back",
    sub: "Sign in to your TrueTailor workspace.",
    submit: "Sign in",
    pending: "Signing in…",
    alt: (
      <>
        New here?{" "}
        <Link href="/register" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </>
    )
  },
  register: {
    heading: "Create your account",
    sub: "A workspace for resumes that stay true to your experience.",
    submit: "Create account",
    pending: "Creating account…",
    alt: (
      <>
        Already registered?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </>
    )
  }
} as const;

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const text = copy[mode];

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const body = mode === "register" ? { email, password, displayName } : { email, password };
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Something went wrong. Please try again.");
        setPending(false);
        return;
      }
      router.push("/app");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-xl border border-line bg-surface p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">{text.heading}</h1>
        <p className="mt-1 text-sm text-ink-soft">{text.sub}</p>

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
          >
            {error}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="mt-6 space-y-5">
          {mode === "register" ? (
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium">
                Full name
              </label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                autoComplete="name"
                required
                maxLength={100}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
              />
            </div>
          ) : null}

          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              required
              minLength={mode === "register" ? 10 : 1}
              maxLength={200}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={mode === "register" ? "password-help" : undefined}
              className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
            />
            {mode === "register" ? (
              <p id="password-help" className="mt-1.5 text-xs text-ink-soft">
                At least 10 characters.
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? text.pending : text.submit}
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-ink-soft">{text.alt}</p>
    </div>
  );
}
