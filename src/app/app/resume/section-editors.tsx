"use client";

import { useId, useState } from "react";
import type { Profile, ProfileInput } from "@/lib/profile/schema";
import { Button, DATE_HELP, formatDateRange, SectionCard, TextField, toInput } from "./ui";

export interface EditorProps {
  profile: Profile;
  busy: boolean;
  onSave: (input: ProfileInput) => Promise<boolean>;
}

const orNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const splitBullets = (raw: string): { text: string }[] =>
  raw
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter((line) => line.length > 0)
    .map((text) => ({ text }));

const joinBullets = (bullets: { text: string }[]): string => bullets.map((b) => b.text).join("\n");

/* ---------- basics ---------- */

export function BasicsEditor({ profile, busy, onSave }: EditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => ({ ...profile.basics }));
  const [links, setLinks] = useState(() => profile.basics.links.map((l) => ({ ...l })));

  function startEdit() {
    setDraft({ ...profile.basics });
    setLinks(profile.basics.links.map((l) => ({ ...l })));
    setEditing(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const input = toInput(profile);
    input.basics = {
      fullName: orNull(draft.fullName ?? ""),
      headline: orNull(draft.headline ?? ""),
      email: orNull(draft.email ?? ""),
      phone: orNull(draft.phone ?? ""),
      location: orNull(draft.location ?? ""),
      links: links
        .filter((l) => l.label.trim().length > 0 && l.url.trim().length > 0)
        .map((l) => ({ ...(l.id ? { id: l.id } : {}), label: l.label.trim(), url: l.url.trim() }))
    };
    if (await onSave(input)) {
      setEditing(false);
    }
  }

  if (!editing) {
    const rows: [string, string | null][] = [
      ["Name", profile.basics.fullName],
      ["Headline", profile.basics.headline],
      ["Email", profile.basics.email],
      ["Phone", profile.basics.phone],
      ["Location", profile.basics.location]
    ];
    return (
      <SectionCard title="Basics">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-ink-soft">{label}</dt>
              <dd className="mt-0.5 font-medium">
                {value ?? <span className="font-normal text-ink-soft">Not provided</span>}
              </dd>
            </div>
          ))}
          <div className="sm:col-span-2">
            <dt className="text-ink-soft">Links</dt>
            <dd className="mt-0.5">
              {profile.basics.links.length === 0 ? (
                <span className="text-ink-soft">None</span>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {profile.basics.links.map((link) => (
                    <li key={link.id} className="rounded-full border border-line px-3 py-1 text-xs">
                      {link.label}: <span className="text-ink-soft">{link.url}</span>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>
        <div className="mt-4">
          <Button onClick={startEdit} disabled={busy}>
            Edit basics
          </Button>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Basics">
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Full name"
            value={draft.fullName ?? ""}
            onChange={(v) => setDraft({ ...draft, fullName: v })}
          />
          <TextField
            label="Headline"
            value={draft.headline ?? ""}
            onChange={(v) => setDraft({ ...draft, headline: v })}
          />
          <TextField
            label="Email"
            value={draft.email ?? ""}
            onChange={(v) => setDraft({ ...draft, email: v })}
          />
          <TextField
            label="Phone"
            value={draft.phone ?? ""}
            onChange={(v) => setDraft({ ...draft, phone: v })}
          />
          <TextField
            label="Location"
            value={draft.location ?? ""}
            onChange={(v) => setDraft({ ...draft, location: v })}
          />
        </div>
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Links</legend>
          {links.map((link, index) => (
            <div key={link.id ?? `new-${index}`} className="flex flex-wrap items-end gap-3">
              <div className="w-40 grow-0">
                <TextField
                  label="Label"
                  required
                  value={link.label}
                  onChange={(v) =>
                    setLinks(links.map((l, i) => (i === index ? { ...l, label: v } : l)))
                  }
                />
              </div>
              <div className="min-w-60 grow">
                <TextField
                  label="URL"
                  required
                  value={link.url}
                  onChange={(v) =>
                    setLinks(links.map((l, i) => (i === index ? { ...l, url: v } : l)))
                  }
                />
              </div>
              <Button
                variant="danger"
                onClick={() => setLinks(links.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            onClick={() =>
              setLinks([...links, { id: undefined as unknown as string, label: "", url: "" }])
            }
          >
            Add link
          </Button>
        </fieldset>
        <div className="flex gap-3">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : "Save basics"}
          </Button>
          <Button onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

/* ---------- summary ---------- */

export function SummaryEditor({ profile, busy, onSave }: EditorProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(profile.summary?.text ?? "");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const input = toInput(profile);
    const trimmed = text.trim();
    input.summary =
      trimmed.length > 0
        ? { ...(profile.summary ? { id: profile.summary.id } : {}), text: trimmed }
        : null;
    if (await onSave(input)) {
      setEditing(false);
    }
  }

  return (
    <SectionCard title="Summary">
      {!editing ? (
        <>
          {profile.summary ? (
            <p className="text-sm leading-relaxed">{profile.summary.text}</p>
          ) : (
            <p className="text-sm text-ink-soft">No summary yet.</p>
          )}
          <div className="mt-4">
            <Button
              onClick={() => {
                setText(profile.summary?.text ?? "");
                setEditing(true);
              }}
              disabled={busy}
            >
              {profile.summary ? "Edit summary" : "Add summary"}
            </Button>
          </div>
        </>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <TextField
            label="Professional summary"
            multiline
            value={text}
            onChange={setText}
            help="Leave empty to remove the summary."
          />
          <div className="flex gap-3">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Saving…" : "Save summary"}
            </Button>
            <Button onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </SectionCard>
  );
}

/* ---------- experience ---------- */

interface ExperienceDraft {
  id?: string;
  employer: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  bulletsText: string;
}

const emptyExperienceDraft: ExperienceDraft = {
  employer: "",
  title: "",
  location: "",
  startDate: "",
  endDate: "",
  isCurrent: false,
  bulletsText: ""
};

export function ExperienceEditor({ profile, busy, onSave }: EditorProps) {
  const [editIndex, setEditIndex] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<ExperienceDraft>(emptyExperienceDraft);
  const currentLabelId = useId();

  function openEdit(index: number | "new") {
    if (index === "new") {
      setDraft(emptyExperienceDraft);
    } else {
      const entry = profile.experience[index];
      if (!entry) {
        return;
      }
      setDraft({
        id: entry.id,
        employer: entry.employer,
        title: entry.title,
        location: entry.location ?? "",
        startDate: entry.startDate ?? "",
        endDate: entry.endDate ?? "",
        isCurrent: entry.isCurrent,
        bulletsText: joinBullets(entry.bullets)
      });
    }
    setEditIndex(index);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const item = {
      ...(draft.id ? { id: draft.id } : {}),
      employer: draft.employer.trim(),
      title: draft.title.trim(),
      location: orNull(draft.location),
      startDate: orNull(draft.startDate),
      endDate: draft.isCurrent ? null : orNull(draft.endDate),
      isCurrent: draft.isCurrent,
      bullets: splitBullets(draft.bulletsText)
    };
    const input = toInput(profile);
    if (editIndex === "new") {
      input.experience = [...input.experience, item];
    } else if (typeof editIndex === "number") {
      input.experience = input.experience.map((e, i) => (i === editIndex ? item : e));
    }
    if (await onSave(input)) {
      setEditIndex(null);
    }
  }

  async function remove(index: number) {
    const input = toInput(profile);
    input.experience = input.experience.filter((_, i) => i !== index);
    await onSave(input);
  }

  const form = (
    <form onSubmit={save} className="space-y-4 rounded-lg border border-line bg-paper p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Employer"
          required
          value={draft.employer}
          onChange={(v) => setDraft({ ...draft, employer: v })}
        />
        <TextField
          label="Job title"
          required
          value={draft.title}
          onChange={(v) => setDraft({ ...draft, title: v })}
        />
        <TextField
          label="Location"
          value={draft.location}
          onChange={(v) => setDraft({ ...draft, location: v })}
        />
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Start"
            value={draft.startDate}
            onChange={(v) => setDraft({ ...draft, startDate: v })}
            help={DATE_HELP}
          />
          <TextField
            label="End"
            value={draft.endDate}
            onChange={(v) => setDraft({ ...draft, endDate: v })}
            help={DATE_HELP}
            disabled={draft.isCurrent}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          id={currentLabelId}
          type="checkbox"
          checked={draft.isCurrent}
          onChange={(e) => setDraft({ ...draft, isCurrent: e.target.checked })}
          className="h-4 w-4 rounded border-line"
        />
        <label htmlFor={currentLabelId} className="text-sm">
          I currently work here
        </label>
      </div>
      <TextField
        label="Achievements and responsibilities"
        multiline
        value={draft.bulletsText}
        onChange={(v) => setDraft({ ...draft, bulletsText: v })}
        help="One bullet per line."
      />
      <div className="flex gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : "Save role"}
        </Button>
        <Button onClick={() => setEditIndex(null)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );

  return (
    <SectionCard
      title="Experience"
      subtitle={`${profile.experience.length} role${profile.experience.length === 1 ? "" : "s"}`}
    >
      <div className="space-y-4">
        {profile.experience.length === 0 && editIndex !== "new" ? (
          <p className="text-sm text-ink-soft">No roles yet. Add your work history.</p>
        ) : null}

        {profile.experience.map((entry, index) =>
          editIndex === index ? (
            <div key={entry.id}>{form}</div>
          ) : (
            <article key={entry.id} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">
                  {entry.title} · <span className="font-normal">{entry.employer}</span>
                </h3>
                <p className="text-xs text-ink-soft">
                  {formatDateRange(entry.startDate, entry.endDate, entry.isCurrent)}
                  {entry.location ? ` · ${entry.location}` : ""}
                </p>
              </div>
              {entry.bullets.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed">
                  {entry.bullets.map((bullet) => (
                    <li key={bullet.id}>{bullet.text}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 flex gap-2">
                <Button onClick={() => openEdit(index)} disabled={busy}>
                  Edit
                </Button>
                <Button variant="danger" onClick={() => remove(index)} disabled={busy}>
                  Delete
                </Button>
              </div>
            </article>
          )
        )}

        {editIndex === "new" ? (
          form
        ) : (
          <Button onClick={() => openEdit("new")} disabled={busy}>
            Add role
          </Button>
        )}
      </div>
    </SectionCard>
  );
}

/* ---------- education ---------- */

interface EducationDraft {
  id?: string;
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  detailsText: string;
}

const emptyEducationDraft: EducationDraft = {
  institution: "",
  degree: "",
  field: "",
  startDate: "",
  endDate: "",
  detailsText: ""
};

export function EducationEditor({ profile, busy, onSave }: EditorProps) {
  const [editIndex, setEditIndex] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<EducationDraft>(emptyEducationDraft);

  function openEdit(index: number | "new") {
    if (index === "new") {
      setDraft(emptyEducationDraft);
    } else {
      const entry = profile.education[index];
      if (!entry) {
        return;
      }
      setDraft({
        id: entry.id,
        institution: entry.institution,
        degree: entry.degree ?? "",
        field: entry.field ?? "",
        startDate: entry.startDate ?? "",
        endDate: entry.endDate ?? "",
        detailsText: joinBullets(entry.details)
      });
    }
    setEditIndex(index);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const item = {
      ...(draft.id ? { id: draft.id } : {}),
      institution: draft.institution.trim(),
      degree: orNull(draft.degree),
      field: orNull(draft.field),
      startDate: orNull(draft.startDate),
      endDate: orNull(draft.endDate),
      details: splitBullets(draft.detailsText)
    };
    const input = toInput(profile);
    if (editIndex === "new") {
      input.education = [...input.education, item];
    } else if (typeof editIndex === "number") {
      input.education = input.education.map((e, i) => (i === editIndex ? item : e));
    }
    if (await onSave(input)) {
      setEditIndex(null);
    }
  }

  async function remove(index: number) {
    const input = toInput(profile);
    input.education = input.education.filter((_, i) => i !== index);
    await onSave(input);
  }

  const form = (
    <form onSubmit={save} className="space-y-4 rounded-lg border border-line bg-paper p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Institution"
          required
          value={draft.institution}
          onChange={(v) => setDraft({ ...draft, institution: v })}
        />
        <TextField
          label="Degree"
          value={draft.degree}
          onChange={(v) => setDraft({ ...draft, degree: v })}
        />
        <TextField
          label="Field of study"
          value={draft.field}
          onChange={(v) => setDraft({ ...draft, field: v })}
        />
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Start"
            value={draft.startDate}
            onChange={(v) => setDraft({ ...draft, startDate: v })}
            help={DATE_HELP}
          />
          <TextField
            label="End"
            value={draft.endDate}
            onChange={(v) => setDraft({ ...draft, endDate: v })}
            help={DATE_HELP}
          />
        </div>
      </div>
      <TextField
        label="Details"
        multiline
        value={draft.detailsText}
        onChange={(v) => setDraft({ ...draft, detailsText: v })}
        help="One item per line — honors, coursework, thesis."
      />
      <div className="flex gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : "Save education"}
        </Button>
        <Button onClick={() => setEditIndex(null)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );

  return (
    <SectionCard
      title="Education"
      subtitle={`${profile.education.length} entr${profile.education.length === 1 ? "y" : "ies"}`}
    >
      <div className="space-y-4">
        {profile.education.length === 0 && editIndex !== "new" ? (
          <p className="text-sm text-ink-soft">No education entries yet.</p>
        ) : null}

        {profile.education.map((entry, index) =>
          editIndex === index ? (
            <div key={entry.id}>{form}</div>
          ) : (
            <article key={entry.id} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">
                  {entry.institution}
                  {entry.degree ? <span className="font-normal"> · {entry.degree}</span> : null}
                  {entry.field ? (
                    <span className="font-normal text-ink-soft"> — {entry.field}</span>
                  ) : null}
                </h3>
                <p className="text-xs text-ink-soft">
                  {formatDateRange(entry.startDate, entry.endDate)}
                </p>
              </div>
              {entry.details.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed">
                  {entry.details.map((detail) => (
                    <li key={detail.id}>{detail.text}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 flex gap-2">
                <Button onClick={() => openEdit(index)} disabled={busy}>
                  Edit
                </Button>
                <Button variant="danger" onClick={() => remove(index)} disabled={busy}>
                  Delete
                </Button>
              </div>
            </article>
          )
        )}

        {editIndex === "new" ? (
          form
        ) : (
          <Button onClick={() => openEdit("new")} disabled={busy}>
            Add education
          </Button>
        )}
      </div>
    </SectionCard>
  );
}

/* ---------- skills ---------- */

export function SkillsEditor({ profile, busy, onSave }: EditorProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length === 0) {
      return;
    }
    const input = toInput(profile);
    input.skills = [...input.skills, { name: name.trim(), category: orNull(category) }];
    if (await onSave(input)) {
      setName("");
      setCategory("");
    }
  }

  async function remove(index: number) {
    const input = toInput(profile);
    input.skills = input.skills.filter((_, i) => i !== index);
    await onSave(input);
  }

  return (
    <SectionCard
      title="Skills"
      subtitle={`${profile.skills.length} skill${profile.skills.length === 1 ? "" : "s"}`}
    >
      {profile.skills.length === 0 ? (
        <p className="text-sm text-ink-soft">No skills yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {profile.skills.map((skill, index) => (
            <li
              key={skill.id}
              className="flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 text-sm"
            >
              <span>{skill.name}</span>
              {skill.category ? (
                <span className="text-xs text-ink-soft">({skill.category})</span>
              ) : null}
              <button
                type="button"
                onClick={() => remove(index)}
                disabled={busy}
                aria-label={`Remove skill ${skill.name}`}
                className="ml-1 rounded-full px-1 text-ink-soft hover:text-danger disabled:opacity-50"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="w-48">
          <TextField label="Skill" required value={name} onChange={setName} />
        </div>
        <div className="w-48">
          <TextField label="Category" value={category} onChange={setCategory} />
        </div>
        <Button type="submit" variant="primary" disabled={busy || name.trim().length === 0}>
          Add skill
        </Button>
      </form>
    </SectionCard>
  );
}

/* ---------- projects ---------- */

interface ProjectDraft {
  id?: string;
  name: string;
  url: string;
  description: string;
  bulletsText: string;
}

const emptyProjectDraft: ProjectDraft = { name: "", url: "", description: "", bulletsText: "" };

export function ProjectsEditor({ profile, busy, onSave }: EditorProps) {
  const [editIndex, setEditIndex] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<ProjectDraft>(emptyProjectDraft);

  function openEdit(index: number | "new") {
    if (index === "new") {
      setDraft(emptyProjectDraft);
    } else {
      const entry = profile.projects[index];
      if (!entry) {
        return;
      }
      setDraft({
        id: entry.id,
        name: entry.name,
        url: entry.url ?? "",
        description: entry.description ?? "",
        bulletsText: joinBullets(entry.bullets)
      });
    }
    setEditIndex(index);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const item = {
      ...(draft.id ? { id: draft.id } : {}),
      name: draft.name.trim(),
      url: orNull(draft.url),
      description: orNull(draft.description),
      bullets: splitBullets(draft.bulletsText)
    };
    const input = toInput(profile);
    if (editIndex === "new") {
      input.projects = [...input.projects, item];
    } else if (typeof editIndex === "number") {
      input.projects = input.projects.map((p, i) => (i === editIndex ? item : p));
    }
    if (await onSave(input)) {
      setEditIndex(null);
    }
  }

  async function remove(index: number) {
    const input = toInput(profile);
    input.projects = input.projects.filter((_, i) => i !== index);
    await onSave(input);
  }

  const form = (
    <form onSubmit={save} className="space-y-4 rounded-lg border border-line bg-paper p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Project name"
          required
          value={draft.name}
          onChange={(v) => setDraft({ ...draft, name: v })}
        />
        <TextField
          label="URL"
          value={draft.url}
          onChange={(v) => setDraft({ ...draft, url: v })}
          help="Full https:// address."
        />
      </div>
      <TextField
        label="Description"
        multiline
        value={draft.description}
        onChange={(v) => setDraft({ ...draft, description: v })}
      />
      <TextField
        label="Highlights"
        multiline
        value={draft.bulletsText}
        onChange={(v) => setDraft({ ...draft, bulletsText: v })}
        help="One item per line."
      />
      <div className="flex gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : "Save project"}
        </Button>
        <Button onClick={() => setEditIndex(null)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );

  return (
    <SectionCard
      title="Projects"
      subtitle={`${profile.projects.length} project${profile.projects.length === 1 ? "" : "s"}`}
    >
      <div className="space-y-4">
        {profile.projects.length === 0 && editIndex !== "new" ? (
          <p className="text-sm text-ink-soft">No projects yet.</p>
        ) : null}

        {profile.projects.map((entry, index) =>
          editIndex === index ? (
            <div key={entry.id}>{form}</div>
          ) : (
            <article key={entry.id} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">{entry.name}</h3>
                {entry.url ? <p className="text-xs text-ink-soft">{entry.url}</p> : null}
              </div>
              {entry.description ? (
                <p className="mt-2 text-sm leading-relaxed">{entry.description}</p>
              ) : null}
              {entry.bullets.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed">
                  {entry.bullets.map((bullet) => (
                    <li key={bullet.id}>{bullet.text}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 flex gap-2">
                <Button onClick={() => openEdit(index)} disabled={busy}>
                  Edit
                </Button>
                <Button variant="danger" onClick={() => remove(index)} disabled={busy}>
                  Delete
                </Button>
              </div>
            </article>
          )
        )}

        {editIndex === "new" ? (
          form
        ) : (
          <Button onClick={() => openEdit("new")} disabled={busy}>
            Add project
          </Button>
        )}
      </div>
    </SectionCard>
  );
}

/* ---------- compact lists: certifications, awards, languages ---------- */

type CompactKind = "certifications" | "awards" | "languages";

interface CompactRow {
  id?: string;
  primary: string;
  secondary: string;
  tertiary: string;
}

const compactConfig: Record<
  CompactKind,
  { title: string; primary: string; secondary: string; tertiary: string; tertiaryHelp?: string }
> = {
  certifications: {
    title: "Certifications",
    primary: "Name",
    secondary: "Issuer",
    tertiary: "Date",
    tertiaryHelp: DATE_HELP
  },
  awards: {
    title: "Awards",
    primary: "Title",
    secondary: "Issuer",
    tertiary: "Date",
    tertiaryHelp: DATE_HELP
  },
  languages: { title: "Languages", primary: "Language", secondary: "Proficiency", tertiary: "" }
};

function readRows(profile: Profile, kind: CompactKind): CompactRow[] {
  if (kind === "certifications") {
    return profile.certifications.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.issuer ?? "",
      tertiary: c.date ?? ""
    }));
  }
  if (kind === "awards") {
    return profile.awards.map((a) => ({
      id: a.id,
      primary: a.title,
      secondary: a.issuer ?? "",
      tertiary: a.date ?? ""
    }));
  }
  return profile.languages.map((l) => ({
    id: l.id,
    primary: l.name,
    secondary: l.proficiency ?? "",
    tertiary: ""
  }));
}

function writeRows(input: ProfileInput, kind: CompactKind, rows: CompactRow[]): void {
  const withId = (row: CompactRow) => (row.id ? { id: row.id } : {});
  if (kind === "certifications") {
    input.certifications = rows.map((r) => ({
      ...withId(r),
      name: r.primary.trim(),
      issuer: orNull(r.secondary),
      date: orNull(r.tertiary)
    }));
  } else if (kind === "awards") {
    input.awards = rows.map((r) => ({
      ...withId(r),
      title: r.primary.trim(),
      issuer: orNull(r.secondary),
      date: orNull(r.tertiary)
    }));
  } else {
    input.languages = rows.map((r) => ({
      ...withId(r),
      name: r.primary.trim(),
      proficiency: orNull(r.secondary)
    }));
  }
}

export function CompactListEditor({
  kind,
  profile,
  busy,
  onSave
}: EditorProps & { kind: CompactKind }) {
  const config = compactConfig[kind];
  const rows = readRows(profile, kind);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<CompactRow>({ primary: "", secondary: "", tertiary: "" });

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (draft.primary.trim().length === 0) {
      return;
    }
    const input = toInput(profile);
    writeRows(input, kind, [...rows, draft]);
    if (await onSave(input)) {
      setDraft({ primary: "", secondary: "", tertiary: "" });
      setAdding(false);
    }
  }

  async function remove(index: number) {
    const input = toInput(profile);
    writeRows(
      input,
      kind,
      rows.filter((_, i) => i !== index)
    );
    await onSave(input);
  }

  return (
    <SectionCard
      title={config.title}
      subtitle={`${rows.length} entr${rows.length === 1 ? "y" : "ies"}`}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">Nothing here yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, index) => (
            <li
              key={row.id ?? index}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-4 py-2.5 text-sm"
            >
              <span>
                <span className="font-medium">{row.primary}</span>
                {row.secondary ? <span className="text-ink-soft"> · {row.secondary}</span> : null}
                {row.tertiary ? <span className="text-ink-soft"> · {row.tertiary}</span> : null}
              </span>
              <Button variant="danger" onClick={() => remove(index)} disabled={busy}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-56">
            <TextField
              label={config.primary}
              required
              value={draft.primary}
              onChange={(v) => setDraft({ ...draft, primary: v })}
            />
          </div>
          <div className="w-48">
            <TextField
              label={config.secondary}
              value={draft.secondary}
              onChange={(v) => setDraft({ ...draft, secondary: v })}
            />
          </div>
          {config.tertiary ? (
            <div className="w-36">
              <TextField
                label={config.tertiary}
                value={draft.tertiary}
                onChange={(v) => setDraft({ ...draft, tertiary: v })}
                help={config.tertiaryHelp}
              />
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={busy}>
              Add
            </Button>
            <Button onClick={() => setAdding(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4">
          <Button onClick={() => setAdding(true)} disabled={busy}>
            Add {config.title.toLowerCase().replace(/s$/, "")}
          </Button>
        </div>
      )}
    </SectionCard>
  );
}
