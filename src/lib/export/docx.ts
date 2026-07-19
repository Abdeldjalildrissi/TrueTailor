import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { formatDateRange, type ExportCoverLetter, type ExportResume } from "./assemble";

function heading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true })]
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [new TextRun(text)]
  });
}

export async function renderResumeDocx(resume: ExportResume): Promise<Uint8Array> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: resume.fullName, bold: true })]
    })
  );
  if (resume.headline) {
    children.push(
      new Paragraph({ children: [new TextRun({ text: resume.headline, italics: true })] })
    );
  }
  const contactLine = [...resume.contacts, ...resume.links.map((l) => `${l.label}: ${l.url}`)].join(
    "  ·  "
  );
  if (contactLine) {
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: contactLine, size: 18 })]
      })
    );
  }

  if (resume.summary) {
    children.push(heading("Summary"));
    children.push(new Paragraph({ children: [new TextRun(resume.summary.text)] }));
  }

  if (resume.experience.length > 0) {
    children.push(heading("Experience"));
    for (const role of resume.experience) {
      const range = formatDateRange(role.startDate, role.endDate, role.isCurrent);
      const meta = [range, role.location].filter(Boolean).join("  ·  ");
      children.push(
        new Paragraph({
          spacing: { before: 160, after: 40 },
          children: [
            new TextRun({ text: role.title, bold: true }),
            new TextRun({ text: `  —  ${role.employer}` })
          ]
        })
      );
      if (meta) {
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: meta, italics: true, size: 18 })]
          })
        );
      }
      for (const line of role.bullets) {
        children.push(bullet(line.text));
      }
    }
  }

  if (resume.skills.length > 0) {
    children.push(heading("Skills"));
    children.push(new Paragraph({ children: [new TextRun(resume.skills.join("  ·  "))] }));
  }

  if (resume.education.length > 0) {
    children.push(heading("Education"));
    for (const entry of resume.education) {
      const degree = [entry.degree, entry.field].filter(Boolean).join(", ");
      const range = formatDateRange(entry.startDate, entry.endDate, false);
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 40 },
          children: [
            new TextRun({ text: entry.institution, bold: true }),
            new TextRun({ text: degree ? `  —  ${degree}` : "" }),
            new TextRun({ text: range ? `  (${range})` : "", size: 18 })
          ]
        })
      );
      for (const detail of entry.details) {
        children.push(bullet(detail));
      }
    }
  }

  if (resume.certifications.length > 0) {
    children.push(heading("Certifications"));
    for (const cert of resume.certifications) {
      children.push(bullet([cert.name, cert.issuer, cert.date].filter(Boolean).join("  ·  ")));
    }
  }

  if (resume.languages.length > 0) {
    children.push(heading("Languages"));
    children.push(
      new Paragraph({
        children: [
          new TextRun(
            resume.languages
              .map((l) => (l.proficiency ? `${l.name} (${l.proficiency})` : l.name))
              .join("  ·  ")
          )
        ]
      })
    );
  }

  const doc = new Document({ sections: [{ children }] });
  return new Uint8Array(await Packer.toBuffer(doc));
}

export async function renderCoverLetterDocx(cover: ExportCoverLetter): Promise<Uint8Array> {
  const children: Paragraph[] = [];
  const headingLine = [cover.roleTitle, cover.company].filter(Boolean).join(" — ");
  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [
        new TextRun({ text: `Cover letter${headingLine ? `: ${headingLine}` : ""}`, bold: true })
      ]
    })
  );
  for (const paragraph of cover.paragraphs) {
    children.push(
      new Paragraph({
        spacing: { before: 160 },
        alignment: AlignmentType.LEFT,
        children: [new TextRun(paragraph.text)]
      })
    );
  }
  if (cover.fullName) {
    children.push(
      new Paragraph({ spacing: { before: 240 }, children: [new TextRun(cover.fullName)] })
    );
  }
  const doc = new Document({ sections: [{ children }] });
  return new Uint8Array(await Packer.toBuffer(doc));
}
