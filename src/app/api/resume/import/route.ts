import { NextResponse } from "next/server";
import { z } from "zod";
import { AIProviderError } from "@/lib/ai";
import { jsonError, parseJsonBody, rateLimited, requireUser } from "@/lib/http/api";
import { importUserLimiter } from "@/lib/http/rate-limit";
import { UnreadableDocumentError, UnsupportedFormatError } from "@/lib/parse";
import { importResume, ProfileValidationError } from "@/lib/profile/service";

export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MiB
const MAX_PASTED_CHARS = 200_000;

const pasteSchema = z.object({
  text: z.string().min(1).max(MAX_PASTED_CHARS),
  filename: z.string().trim().min(1).max(200).default("pasted-resume.txt")
});

export async function POST(req: Request) {
  const { user, response: authResponse } = await requireUser(req);
  if (!user) {
    return authResponse;
  }

  const limit = importUserLimiter.check(`import:${user.id}`);
  if (!limit.allowed) {
    return rateLimited(limit.retryAfterSeconds);
  }

  const contentType = req.headers.get("content-type") ?? "";
  let filename: string;
  let mimeType: string | null;
  let bytes: Uint8Array;

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return jsonError(400, "Malformed upload. Please try again.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonError(400, 'Attach a resume file in the "file" field.');
    }
    if (file.size === 0) {
      return jsonError(400, "The uploaded file is empty.");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return jsonError(413, "Resume files are limited to 5 MB.");
    }
    filename = file.name || "resume";
    mimeType = file.type || null;
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    const { data, response } = await parseJsonBody(req, pasteSchema);
    if (!data) {
      return response;
    }
    filename = data.filename.toLowerCase().endsWith(".txt")
      ? data.filename
      : `${data.filename}.txt`;
    mimeType = "text/plain";
    bytes = new TextEncoder().encode(data.text);
  }

  try {
    const result = await importResume(user.id, { filename, mimeType, bytes });
    return NextResponse.json(
      {
        profile: result.profile,
        warnings: result.warnings,
        version: result.version,
        document: { filename: result.documentFilename }
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof UnsupportedFormatError || error instanceof UnreadableDocumentError) {
      return jsonError(400, error.message);
    }
    if (error instanceof AIProviderError) {
      return jsonError(502, error.message);
    }
    if (error instanceof ProfileValidationError) {
      return jsonError(422, error.message, { details: error.issues });
    }
    throw error;
  }
}
