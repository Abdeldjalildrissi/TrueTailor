import { formatDateRange, type ExportResume } from "./assemble";

/**
 * LaTeX export — renders the tailored, verified resume into the owner's
 * reference template (two-column paracol layout, Times New Roman via
 * mathptmx, slate section headers with rules). The template's structure,
 * fonts, colors, spacing, and column ratios are preserved verbatim; only
 * data is injected, and every injected string is LaTeX-escaped.
 *
 * The photo slot is honored when a profile photo exists (the export ships
 * as a zip with the image next to the .tex); without one, the photo block
 * is omitted entirely and the left column flows up cleanly — same design,
 * no dangling placeholder.
 *
 * This renderer consumes the same gated ExportResume as every other format:
 * blocked lines have already been removed by assembleResume.
 */

const SPECIALS: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "&": "\\&",
  "%": "\\%",
  $: "\\$",
  "#": "\\#",
  _: "\\_",
  "{": "\\{",
  "}": "\\}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}"
};

export function escapeLatex(value: string): string {
  return value.replace(/[\\&%$#_{}~^]/g, (ch) => SPECIALS[ch] ?? ch);
}

function itemize(items: string[], options: { label: string; margin: string }): string {
  const lines = items.map((item) => `        \\item ${item}`).join("\n");
  return [
    `    \\begin{itemize}[leftmargin=${options.margin}, label={${options.label}}, itemsep=0.3ex, topsep=0.8ex]`,
    lines,
    "    \\end{itemize}"
  ].join("\n");
}

/** A left-column section in the template's compact dash-list style. */
function leftSection(title: string, items: string[]): string {
  if (items.length === 0) {
    return "";
  }
  return [
    `    \\section*{${escapeLatex(title)}}`,
    "    \\begin{itemize}[leftmargin=1em, label={-}, itemsep=0.2ex, topsep=0ex]",
    items.map((item) => `        \\item ${item}`).join("\n"),
    "    \\end{itemize}",
    "    \\vspace{1ex}",
    ""
  ].join("\n");
}

export interface LatexRenderOptions {
  /** Filename of the photo shipped alongside the .tex, or null for no photo. */
  photoFilename: string | null;
}

export function renderResumeLatex(resume: ExportResume, options: LatexRenderOptions): string {
  const photoBlock = options.photoFilename
    ? [
        "    % --- Photo ---",
        "    \\begin{center}",
        `        \\includegraphics[width=0.75\\linewidth]{${options.photoFilename}}`,
        "    \\end{center}",
        "    \\vspace{2ex}",
        ""
      ].join("\n")
    : "";

  // --- Contact (labeled slots; only the fields that exist) ---
  const contactLines: string[] = [];
  if (resume.phone) {
    contactLines.push(`    \\textbf{Mob:} ${escapeLatex(resume.phone)} \\\\`);
  }
  if (resume.email) {
    contactLines.push("    \\textbf{Mail:} \\\\", `    ${escapeLatex(resume.email)} \\\\`);
  }
  if (resume.location) {
    contactLines.push(`    \\textbf{Address:} ${escapeLatex(resume.location)} \\\\`);
  }
  for (const link of resume.links) {
    contactLines.push(`    \\textbf{${escapeLatex(link.label)}:} ${escapeLatex(link.url)} \\\\`);
  }
  const contactBlock =
    contactLines.length > 0
      ? ["    \\section*{Contact}", ...contactLines, "    \\vspace{2ex}", ""].join("\n")
      : "";

  // --- Skill groups: one left-column section per profile category ---
  const skillSections = resume.skillGroups
    .map((group) =>
      leftSection(
        group.category ?? "Skills",
        group.names.map((name) => escapeLatex(name))
      )
    )
    .join("");

  const languagesSection = leftSection(
    "Languages",
    resume.languages.map((l) =>
      l.proficiency ? `${escapeLatex(l.name)}: ${escapeLatex(l.proficiency)}` : escapeLatex(l.name)
    )
  );

  // --- Right column header: headline line(s) + name, template order ---
  const headerLines: string[] = ["    {\\centering"];
  if (resume.headline) {
    headerLines.push(
      `        {\\Large \\bfseries \\color{primary} ${escapeLatex(resume.headline)}} \\\\[1.5ex]`
    );
  }
  headerLines.push(
    `        {\\Huge \\bfseries ${escapeLatex(resume.fullName)}} \\\\[2.5ex]`,
    "    \\par}"
  );

  const summaryBlock = resume.summary
    ? [
        "    % --- Summary ---",
        "    \\Justifying",
        `    \\noindent ${escapeLatex(resume.summary.text)}`,
        "    \\vspace{2.5ex}",
        ""
      ].join("\n")
    : "";

  const experienceEntries = resume.experience
    .map((role) => {
      const range = formatDateRange(role.startDate, role.endDate, role.isCurrent);
      const headerBits = [
        `\\textbf{${escapeLatex(role.title)} | ${escapeLatex(role.employer)}${
          range ? ` (${escapeLatex(range)})` : ""
        }${role.location ? ` | ${escapeLatex(role.location)}` : ""}}`
      ];
      const bullets =
        role.bullets.length > 0
          ? itemize(
              role.bullets.map((b) => escapeLatex(b.text)),
              { label: "\\textbullet", margin: "1.2em" }
            )
          : "";
      return [`    \\noindent ${headerBits.join("")}`, bullets, "    \\vspace{2ex}", ""]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
  const experienceBlock =
    resume.experience.length > 0
      ? ["    \\section*{Professional experience:}", "", experienceEntries].join("\n")
      : "";

  const certificationItems = resume.certifications.map((cert) => {
    const meta = [cert.date, cert.issuer].filter(Boolean).map((v) => escapeLatex(v as string));
    return `\\textbf{${escapeLatex(cert.name)}${meta.length > 0 ? ` (${meta.join(") | (")})` : ""}}`;
  });
  const certificationsBlock =
    certificationItems.length > 0
      ? [
          "    \\section*{Certificates and Attestation}",
          itemize(certificationItems, { label: "\\textbullet", margin: "1.2em" }),
          "    \\vspace{2.5ex}",
          ""
        ].join("\n")
      : "";

  const educationItems = resume.education.map((entry) => {
    const degreeBits = [entry.degree, entry.field].filter(Boolean).join(" in ");
    const range = formatDateRange(entry.startDate, entry.endDate, false);
    const head = `\\textbf{${escapeLatex(degreeBits || entry.institution)}${
      range ? ` (${escapeLatex(range)})` : ""
    }${degreeBits ? ` | ${escapeLatex(entry.institution)}` : ""}}`;
    const details = entry.details.map((d) => escapeLatex(d)).join(" \\\\\n        ");
    return details ? `${head} \\\\\n        ${details}` : head;
  });
  const educationBlock =
    educationItems.length > 0
      ? [
          "    \\section*{Education:}",
          itemize(educationItems, { label: "\\textbullet", margin: "1.2em" })
        ].join("\n")
      : "";

  return `\\documentclass[11pt, a4paper]{article}

% =========================================================================
% PACKAGES & FONTS (Times New Roman)
% =========================================================================
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{mathptmx}                % Times New Roman font clone
\\renewcommand{\\familydefault}{\\rmdefault} % Set default font to Serif
\\usepackage[left=1.2cm, right=1.2cm, top=1.2cm, bottom=1.2cm]{geometry}
\\usepackage{xcolor}
\\usepackage{paracol}                 % For accurate multi-column layout
\\usepackage{graphicx}                % For the profile photo
\\usepackage{titlesec}                % For section styling
\\usepackage{enumitem}                % For precise bullet point matching
\\usepackage{ragged2e}                % For text alignment
\\usepackage{setspace}

% =========================================================================
% COLOR PALETTE (Strict Professional Defaults)
% =========================================================================
\\definecolor{primary}{HTML}{2B3E50}  % Dark slate for headers
\\definecolor{textdark}{HTML}{000000} % Pure black for maximum readability

\\color{textdark}

% =========================================================================
% SECTION FORMATTING
% =========================================================================
\\titleformat{\\section}
  {\\large\\bfseries\\color{primary}} % Font size and weight
  {}
  {0em}
  {}
  [\\vspace{-0.5ex}\\rule{\\linewidth}{1.2pt}] % Solid separation line

\\titlespacing*{\\section}{0pt}{2.5ex}{1.5ex}

% =========================================================================
% DOCUMENT START
% =========================================================================
\\begin{document}

% Column ratios (Left: ~32%, Right: ~63%, Gap: 5%)
\\columnratio{0.32}
\\setlength{\\columnsep}{0.05\\textwidth}

\\begin{paracol}{2}

% -------------------------------------------------------------------------
% LEFT COLUMN
% -------------------------------------------------------------------------
\\begin{leftcolumn}

${photoBlock}${contactBlock}${skillSections}${languagesSection}\\end{leftcolumn}

% -------------------------------------------------------------------------
% RIGHT COLUMN
% -------------------------------------------------------------------------
\\switchcolumn
\\begin{rightcolumn}

${headerLines.join("\n")}

${summaryBlock}${experienceBlock}
${certificationsBlock}${educationBlock}

\\end{rightcolumn}
\\end{paracol}

\\end{document}
`;
}
