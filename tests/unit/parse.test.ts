import { Document, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  detectFormat,
  parseResumeFile,
  UnreadableDocumentError,
  UnsupportedFormatError
} from "@/lib/parse";

const LONG_LINE =
  "Jane Fixture Senior Platform Engineer with experience in distributed systems and cloud infrastructure.";

async function makePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText(LONG_LINE, { x: 40, y: 700, size: 11, font });
  page.drawText("PDF-MARKER-77421 unique token line for extraction.", {
    x: 40,
    y: 680,
    size: 11,
    font
  });
  return doc.save();
}

async function makeDocx(): Promise<Uint8Array> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun(LONG_LINE)] }),
          new Paragraph({ children: [new TextRun("DOCX-MARKER-88532 unique token line.")] })
        ]
      }
    ]
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

describe("detectFormat", () => {
  it("prefers file extension, falls back to mime type", () => {
    expect(detectFormat("resume.pdf", null)).toBe("pdf");
    expect(detectFormat("resume.docx", null)).toBe("docx");
    expect(detectFormat("resume.md", null)).toBe("markdown");
    expect(detectFormat("notes", "text/plain")).toBe("text");
    expect(detectFormat("archive.zip", "application/zip")).toBeNull();
  });
});

describe("parseResumeFile", () => {
  it("extracts text from a real PDF", async () => {
    const bytes = await makePdf();
    const parsed = await parseResumeFile("resume.pdf", "application/pdf", bytes);
    expect(parsed.format).toBe("pdf");
    expect(parsed.text).toContain("PDF-MARKER-77421");
    expect(parsed.text).toContain("Jane Fixture");
  });

  it("extracts text from a real DOCX", async () => {
    const bytes = await makeDocx();
    const parsed = await parseResumeFile(
      "resume.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes
    );
    expect(parsed.format).toBe("docx");
    expect(parsed.text).toContain("DOCX-MARKER-88532");
  });

  it("passes markdown and plain text through", async () => {
    const md = `# Jane Fixture\n\n${LONG_LINE}`;
    const parsed = await parseResumeFile("resume.md", null, new TextEncoder().encode(md));
    expect(parsed.format).toBe("markdown");
    expect(parsed.text).toContain("# Jane Fixture");
  });

  it("rejects unsupported formats", async () => {
    await expect(
      parseResumeFile("resume.zip", "application/zip", new Uint8Array([1, 2, 3]))
    ).rejects.toBeInstanceOf(UnsupportedFormatError);
  });

  it("rejects corrupt PDFs as unreadable", async () => {
    const junk = new TextEncoder().encode("definitely not a pdf ".repeat(10));
    await expect(parseResumeFile("resume.pdf", "application/pdf", junk)).rejects.toBeInstanceOf(
      UnreadableDocumentError
    );
  });

  it("rejects documents with too little text", async () => {
    await expect(
      parseResumeFile("resume.txt", "text/plain", new TextEncoder().encode("hi"))
    ).rejects.toBeInstanceOf(UnreadableDocumentError);
  });
});
