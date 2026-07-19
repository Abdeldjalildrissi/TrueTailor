import { NextResponse } from "next/server";
import { requireUser } from "@/lib/http/api";
import { listTailorings } from "@/lib/tailor/service";

export async function GET(req: Request) {
  const { user, response } = await requireUser(req);
  if (!user) {
    return response;
  }
  const items = await listTailorings(user.id);
  return NextResponse.json({
    tailorings: items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }))
  });
}
