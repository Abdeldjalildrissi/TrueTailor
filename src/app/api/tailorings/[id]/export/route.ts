import { NextResponse } from "next/server";
import JSZip from "jszip";
import { z } from "zod";
import { assembleCoverLetter, assembleResume } from "@/lib/export/assemble";
import { renderCoverLetterDocx, renderResumeDocx } from "@/lib/export/docx";
import { renderResumeLatex } from "@/lib/export/latex";
import { renderCoverLetterMarkdown, renderResumeMarkdown } from "@/lib/export/markdown";
import { renderCoverLetterPdf, renderResumePdf } from "@/lib/export/pdf";
import { jsonError, requireUser } from "@/lib/http/api";
import { getProfilePhoto } from "@/lib/profile/photo";
import { getDecisions, getTailoring } from "@/lib/tailor/service";

const querySchema = z.object({
  format: z.enum(["markdown", "docx", "pdf", "latex"]).default("pdf"),
  doc: z.enum(["resume", "cover"]).default("resume")
});

const CONTENT_TYPES = {
  markdown: "text/markdown; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  latex: "application/x-tex; charset=utf-8"
} as const;

const EXTENSIONS = { markdown: "md", docx: "docx", pdf: "pdf", latex: "tex" } as const;

const LATEX_README = `This archive contains your tailored resume as a LaTeX project.

Files:
  resume.tex   — the resume, rendered into the reference template
  photo.*      — your profile photo, referenced by resume.tex (when present)

To get a PDF:
  1. Go to https://overleaf.com (free), create a new blank project,
     and upload every file from this archive.
  2. Click Recompile. That's it.
Or locally with a TeX distribution: pdflatex resume.tex
`;

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "tailored"
  );
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser(req);
  if (!user) {
    return response;
  }
  const { id } = await context.params;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return jsonError(400, "Invalid export parameters.", {
      details: parsed.error.flatten().fieldErrors
    });
  }
  const { format, doc } = parsed.data;

  const record = await getTailoring(user.id, id);
  if (!record) {
    return jsonError(404, "Tailoring not found.");
  }
  const decisions = await getDecisions(user.id, id);

  const assembleInput = {
    profile: record.profile,
    result: record.result,
    verification: record.verification,
    decisions
  };

  const baseName = slugify(
    [record.company, record.roleTitle].filter(Boolean).join("-") || record.id
  );

  let bytes: Uint8Array;
  let filename: string;

  if (doc === "cover") {
    if (format === "latex") {
      return jsonError(400, "LaTeX export is available for the resume document.");
    }
    const cover = assembleCoverLetter({
      ...assembleInput,
      roleTitle: record.roleTitle,
      company: record.company
    });
    if (!cover) {
      return jsonError(404, "This tailoring has no cover letter content to export.");
    }
    filename = `cover-letter-${baseName}.${EXTENSIONS[format]}`;
    if (format === "markdown") {
      bytes = new TextEncoder().encode(renderCoverLetterMarkdown(cover));
    } else if (format === "docx") {
      bytes = await renderCoverLetterDocx(cover);
    } else {
      bytes = await renderCoverLetterPdf(cover);
    }
  } else {
    const resume = assembleResume(assembleInput);
    filename = `resume-${baseName}.${EXTENSIONS[format]}`;
    if (format === "latex") {
      // Photo present → ship a compile-ready zip (tex + image + readme);
      // no photo → the .tex alone, photo block omitted by the renderer.
      const photo = await getProfilePhoto(user.id);
      if (photo) {
        const photoFilename = photo.mime === "image/png" ? "photo.png" : "photo.jpg";
        const tex = renderResumeLatex(resume, { photoFilename });
        const zip = new JSZip();
        zip.file("resume.tex", tex);
        zip.file(photoFilename, photo.bytes);
        zip.file("README.txt", LATEX_README);
        const archive = await zip.generateAsync({ type: "uint8array" });
        return new NextResponse(Buffer.from(archive), {
          headers: {
            "content-type": "application/zip",
            "content-disposition": `attachment; filename="resume-${baseName}-latex.zip"`,
            "cache-control": "no-store"
          }
        });
      }
      bytes = new TextEncoder().encode(renderResumeLatex(resume, { photoFilename: null }));
    } else if (format === "markdown") {
      bytes = new TextEncoder().encode(renderResumeMarkdown(resume));
    } else if (format === "docx") {
      bytes = await renderResumeDocx(resume);
    } else {
      bytes = await renderResumePdf(resume);
    }
  }

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": CONTENT_TYPES[format],
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store"
    }
  });
}
