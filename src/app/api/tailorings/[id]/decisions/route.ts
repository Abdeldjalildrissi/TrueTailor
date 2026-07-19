import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, parseJsonBody, requireUser } from "@/lib/http/api";
import { DecisionError, getDecisions, saveDecisions } from "@/lib/tailor/service";

const bodySchema = z.object({
  decisions: z
    .array(
      z
        .object({
          claimPath: z.string().min(1).max(200),
          action: z.enum(["accept", "reject", "edit"]),
          editedText: z.string().trim().min(1).max(1500).nullable().default(null)
        })
        .refine((d) => d.action !== "edit" || (d.editedText?.length ?? 0) > 0, {
          message: "Edited lines need replacement text."
        })
    )
    .min(1)
    .max(100)
});

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response: authResponse } = await requireUser(req);
  if (!user) {
    return authResponse;
  }
  const { id } = await context.params;
  const { data, response } = await parseJsonBody(req, bodySchema);
  if (!data) {
    return response;
  }
  try {
    const decisions = await saveDecisions(user.id, id, data.decisions);
    return NextResponse.json({ decisions });
  } catch (error) {
    if (error instanceof DecisionError) {
      return error.message === "Tailoring not found."
        ? jsonError(404, error.message)
        : jsonError(400, error.message);
    }
    throw error;
  }
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser(req);
  if (!user) {
    return response;
  }
  const { id } = await context.params;
  const decisions = await getDecisions(user.id, id);
  return NextResponse.json({ decisions });
}
