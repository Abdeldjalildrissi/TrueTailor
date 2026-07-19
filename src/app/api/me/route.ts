import { NextResponse } from "next/server";
import { requireUser } from "@/lib/http/api";

export async function GET(req: Request) {
  const { user, response } = await requireUser(req);
  if (!user) {
    return response;
  }
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString()
    }
  });
}
