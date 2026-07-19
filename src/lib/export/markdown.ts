import { formatDateRange, type ExportCoverLetter, type ExportResume } from "./assemble";

export function renderResumeMarkdown(resume: ExportResume): string {
  const lines: string[] = [];
  lines.push(`# ${resume.fullName}`);
  if (resume.headline) {
    lines.push("", `**${resume.headline}**`);
  }
  const contactLine = [
    ...resume.contacts,
    ...resume.links.map((l) => `[${l.label}](${l.url})`)
  ].join(" · ");
  if (contactLine) {
    lines.push("", contactLine);
  }

  if (resume.summary) {
    lines.push("", "## Summary", "", resume.summary.text);
  }

  if (resume.experience.length > 0) {
    lines.push("", "## Experience");
    for (const role of resume.experience) {
      const range = formatDateRange(role.startDate, role.endDate, role.isCurrent);
      const meta = [range, role.location].filter(Boolean).join(" · ");
      lines.push("", `### ${role.title} — ${role.employer}`);
      if (meta) {
        lines.push("", `*${meta}*`);
      }
      if (role.bullets.length > 0) {
        lines.push("");
        for (const bullet of role.bullets) {
          lines.push(`- ${bullet.text}`);
        }
      }
    }
  }

  if (resume.skills.length > 0) {
    lines.push("", "## Skills", "", resume.skills.join(" · "));
  }

  if (resume.education.length > 0) {
    lines.push("", "## Education");
    for (const entry of resume.education) {
      const degree = [entry.degree, entry.field].filter(Boolean).join(", ");
      const range = formatDateRange(entry.startDate, entry.endDate, false);
      lines.push("", `### ${entry.institution}${degree ? ` — ${degree}` : ""}`);
      if (range) {
        lines.push("", `*${range}*`);
      }
      for (const detail of entry.details) {
        lines.push(`- ${detail}`);
      }
    }
  }

  if (resume.certifications.length > 0) {
    lines.push("", "## Certifications");
    for (const cert of resume.certifications) {
      const parts = [cert.name, cert.issuer, cert.date].filter(Boolean).join(" · ");
      lines.push(`- ${parts}`);
    }
  }

  if (resume.languages.length > 0) {
    lines.push("", "## Languages");
    lines.push(
      "",
      resume.languages
        .map((l) => (l.proficiency ? `${l.name} (${l.proficiency})` : l.name))
        .join(" · ")
    );
  }

  return `${lines.join("\n")}\n`;
}

export function renderCoverLetterMarkdown(cover: ExportCoverLetter): string {
  const lines: string[] = [];
  const heading = [cover.roleTitle, cover.company].filter(Boolean).join(" — ");
  lines.push(`# Cover letter${heading ? `: ${heading}` : ""}`);
  for (const paragraph of cover.paragraphs) {
    lines.push("", paragraph.text);
  }
  if (cover.fullName) {
    lines.push("", cover.fullName);
  }
  return `${lines.join("\n")}\n`;
}
