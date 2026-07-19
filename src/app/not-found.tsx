import Link from "next/link";

export default function NotFound() {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center px-6 text-center"
    >
      <p className="text-sm font-semibold uppercase tracking-widest text-accent">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-md text-ink-soft">
        The page you are looking for does not exist or has moved.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-accent px-5 py-2.5 font-medium text-white transition-colors hover:bg-accent-strong"
      >
        Back to home
      </Link>
    </main>
  );
}
