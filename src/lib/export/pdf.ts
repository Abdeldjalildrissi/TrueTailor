import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatDateRange, type ExportCoverLetter, type ExportResume } from "./assemble";

/**
 * Deterministic single-column PDF layout built directly with pdf-lib —
 * no headless browser, fully verifiable byte output.
 */

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const INK = rgb(0.09, 0.1, 0.13);
const SOFT = rgb(0.35, 0.38, 0.44);
const LINE = rgb(0.85, 0.86, 0.89);

class PdfWriter {
  private page!: PDFPage;
  private y = 0;

  private constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont
  ) {
    this.addPage();
  }

  static async create(): Promise<PdfWriter> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    return new PdfWriter(doc, font, bold);
  }

  private addPage(): void {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  private ensure(height: number): void {
    if (this.y - height < MARGIN) {
      this.addPage();
    }
  }

  wrap(text: string, font: PDFFont, size: number, maxWidth = CONTENT_WIDTH): string[] {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current.length > 0 ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) {
          lines.push(current);
        }
        current = word;
      }
    }
    if (current) {
      lines.push(current);
    }
    return lines.length > 0 ? lines : [""];
  }

  text(
    content: string,
    options: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      indent?: number;
      leading?: number;
      maxWidth?: number;
    } = {}
  ): void {
    const size = options.size ?? 10;
    const font = options.bold ? this.bold : this.font;
    const leading = options.leading ?? size * 1.38;
    const indent = options.indent ?? 0;
    const lines = this.wrap(content, font, size, (options.maxWidth ?? CONTENT_WIDTH) - indent);
    for (const line of lines) {
      this.ensure(leading);
      this.y -= leading;
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y,
        size,
        font,
        color: options.color ?? INK
      });
    }
  }

  rowWithRight(left: string, right: string, options: { size?: number; bold?: boolean } = {}): void {
    const size = options.size ?? 10.5;
    const leftFont = options.bold ? this.bold : this.font;
    const leading = size * 1.4;
    this.ensure(leading);
    this.y -= leading;
    this.page.drawText(left, { x: MARGIN, y: this.y, size, font: leftFont, color: INK });
    if (right) {
      const rightSize = 8.5;
      const width = this.font.widthOfTextAtSize(right, rightSize);
      this.page.drawText(right, {
        x: PAGE_WIDTH - MARGIN - width,
        y: this.y + (size - rightSize) / 2,
        size: rightSize,
        font: this.font,
        color: SOFT
      });
    }
  }

  sectionHeading(title: string): void {
    this.spacer(14);
    this.ensure(24);
    this.text(title.toUpperCase(), { size: 9, bold: true, color: SOFT, leading: 14 });
    this.y -= 4;
    this.ensure(2);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.7,
      color: LINE
    });
    this.y -= 6;
  }

  bullet(content: string): void {
    const size = 10;
    const leading = size * 1.38;
    const lines = this.wrap(content, this.font, size, CONTENT_WIDTH - 14);
    lines.forEach((line, index) => {
      this.ensure(leading);
      this.y -= leading;
      if (index === 0) {
        this.page.drawText("•", { x: MARGIN + 2, y: this.y, size, font: this.font, color: SOFT });
      }
      this.page.drawText(line, { x: MARGIN + 14, y: this.y, size, font: this.font, color: INK });
    });
  }

  spacer(height: number): void {
    this.ensure(height);
    this.y -= height;
  }

  async bytes(): Promise<Uint8Array> {
    return this.doc.save();
  }
}

export async function renderResumePdf(resume: ExportResume): Promise<Uint8Array> {
  const writer = await PdfWriter.create();

  writer.text(resume.fullName, { size: 19, bold: true, leading: 24 });
  if (resume.headline) {
    writer.text(resume.headline, { size: 10.5, color: SOFT });
  }
  const contactLine = [...resume.contacts, ...resume.links.map((l) => l.url)].join("  ·  ");
  if (contactLine) {
    writer.text(contactLine, { size: 8.5, color: SOFT });
  }

  if (resume.summary) {
    writer.sectionHeading("Summary");
    writer.text(resume.summary.text);
  }

  if (resume.experience.length > 0) {
    writer.sectionHeading("Experience");
    resume.experience.forEach((role, index) => {
      if (index > 0) {
        writer.spacer(8);
      }
      const range = formatDateRange(role.startDate, role.endDate, role.isCurrent);
      const meta = [range, role.location].filter(Boolean).join("  ·  ");
      writer.rowWithRight(`${role.title}  —  ${role.employer}`, meta, { bold: true });
      for (const line of role.bullets) {
        writer.bullet(line.text);
      }
    });
  }

  if (resume.skills.length > 0) {
    writer.sectionHeading("Skills");
    writer.text(resume.skills.join("  ·  "));
  }

  if (resume.education.length > 0) {
    writer.sectionHeading("Education");
    for (const entry of resume.education) {
      const degree = [entry.degree, entry.field].filter(Boolean).join(", ");
      const range = formatDateRange(entry.startDate, entry.endDate, false);
      writer.rowWithRight(`${entry.institution}${degree ? `  —  ${degree}` : ""}`, range, {
        bold: true
      });
      for (const detail of entry.details) {
        writer.bullet(detail);
      }
    }
  }

  if (resume.certifications.length > 0) {
    writer.sectionHeading("Certifications");
    for (const cert of resume.certifications) {
      writer.bullet([cert.name, cert.issuer, cert.date].filter(Boolean).join("  ·  "));
    }
  }

  if (resume.languages.length > 0) {
    writer.sectionHeading("Languages");
    writer.text(
      resume.languages
        .map((l) => (l.proficiency ? `${l.name} (${l.proficiency})` : l.name))
        .join("  ·  ")
    );
  }

  return writer.bytes();
}

export async function renderCoverLetterPdf(cover: ExportCoverLetter): Promise<Uint8Array> {
  const writer = await PdfWriter.create();
  const headingLine = [cover.roleTitle, cover.company].filter(Boolean).join(" — ");
  writer.text(`Cover letter${headingLine ? `: ${headingLine}` : ""}`, {
    size: 15,
    bold: true,
    leading: 20
  });
  writer.spacer(6);
  for (const paragraph of cover.paragraphs) {
    writer.text(paragraph.text, { leading: 15 });
    writer.spacer(8);
  }
  if (cover.fullName) {
    writer.spacer(10);
    writer.text(cover.fullName);
  }
  return writer.bytes();
}
