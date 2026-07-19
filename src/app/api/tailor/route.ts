import { NextResponse } from "next/server";
import { z } from "zod";
import { AIProviderError } from "@/lib/ai";
import { jsonError, parseJsonBody, rateLimited, requireUser } from "@/lib/http/api";
import { tailorUserLimiter } from "@/lib/http/rate-limit";
import { NoProfileError, tailorResume } from "@/lib/tailor/service";

export const maxDuration = 300;

const bodySchema = z.object({
  jobText: z
    .string()
    .trim()
    .min(80, "Paste the full job description (at least 80 characters).")
    .max(60_000),
  coverLetter: z.boolean().default(false)
});

export async function POST(req: Request) {
  const { user, response: authResponse } = await requireUser(req);
  if (!user) {
    return authResponse;
  }

  const limit = tailorUserLimiter.check(`tailor:${user.id}`);
  if (!limit.allowed) {
    return rateLimited(limit.retryAfterSeconds);
  }

  const { data, response } = await parseJsonBody(req, bodySchema);
  if (!data) {
    return response;
  }

  try {
    const record = await tailorResume(user.id, data.jobText, { coverLetter: data.coverLetter });
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    if (error instanceof NoProfileError) {
      return jsonError(409, error.message);
    }
    if (error instanceof AIProviderError) {
      return jsonError(502, error.message);
    }
    throw error;
  }
}
