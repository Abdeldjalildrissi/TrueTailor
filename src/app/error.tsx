"use client";

export default function ErrorBoundary({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center px-6 text-center"
    >
      <p className="text-sm font-semibold uppercase tracking-widest text-danger">Error</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-md text-ink-soft">
        An unexpected error occurred{error.digest ? ` (reference ${error.digest})` : ""}. You can
        try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-md bg-accent px-5 py-2.5 font-medium text-white transition-colors hover:bg-accent-strong"
      >
        Try again
      </button>
    </main>
  );
}
