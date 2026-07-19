import { NextResponse } from "next/server";
import { readCookie } from "@/lib/auth/current-user";
import { destroySession, SESSION_COOKIE } from "@/lib/auth/session";
import { isSecureOrigin } from "@/lib/env";

export async function POST(req: Request) {
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  if (token) {
    await destroySession(token);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureOrigin(),
    maxAge: 0,
    path: "/"
  });
  return res;
}
