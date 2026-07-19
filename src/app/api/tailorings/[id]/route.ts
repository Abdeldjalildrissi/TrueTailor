import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/http/api";
import { getTailoring } from "@/lib/tailor/service";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser(req);
  if (!user) {
    return response;
  }
  const { id } = await context.params;
  const record = await getTailoring(user.id, id);
  if (!record) {
    return jsonError(404, "Tailoring not found.");
  }
  return NextResponse.json(record);
}
