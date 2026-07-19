"use client";

import { useId } from "react";
import type { Profile, ProfileInput } from "@/lib/profile/schema";

export function SectionCard({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="rounded-xl border border-line bg-surface p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="text-xs text-ink-soft">{subtitle}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function TextField({
  label,
  value,
  onChange,
  help,
  required = false,
  disabled = false,
  multiline = false
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  help?: string;
  required?: boolean;
  disabled?: boolean;
  multiline?: boolean;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  const shared = {
    id,
    value,
    required,
    disabled,
    "aria-describedby": help ? helpId : undefined,
    className:
      "mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm disabled:bg-paper disabled:text-ink-soft"
  };
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required ? null : <span className="ml-1 font-normal text-ink-soft">(optional)</span>}
      </label>
      {multiline ? (
        <textarea {...shared} rows={4} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...shared} type="text" onChange={(e) => onChange(e.target.value)} />
      )}
      {help ? (
        <p id={helpId} className="mt-1 text-xs text-ink-soft">
          {help}
        </p>
      ) : null}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  type = "button",
  disabled = false
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const styles = {
    primary: "bg-accent text-white hover:bg-accent-strong border border-accent",
    secondary: "border border-line text-ink hover:border-ink-soft bg-surface",
    danger: "border border-danger/40 text-danger hover:bg-danger-soft bg-surface"
  } as const;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

/** Converts the authoritative profile into the PUT input shape (ids preserved). */
export function toInput(profile: Profile): ProfileInput {
  return JSON.parse(JSON.stringify(profile)) as ProfileInput;
}

export const DATE_HELP = "YYYY or YYYY-MM";

export function formatDateRange(
  startDate: string | null,
  endDate: string | null,
  isCurrent?: boolean
): string {
  const start = startDate ?? "";
  const end = isCurrent ? "Present" : (endDate ?? "");
  if (!start && !end) {
    return "";
  }
  return `${start || "…"} — ${end || "…"}`;
}
