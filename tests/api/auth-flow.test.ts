import { describe, expect, it } from "vitest";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { GET as healthzGet } from "@/app/api/healthz/route";
import { GET as meGet } from "@/app/api/me/route";

const BASE = "http://localhost:3000";

function jsonRequest(path: string, body: unknown, cookie?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) {
    headers.cookie = cookie;
  }
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

function getRequest(path: string, cookie?: string): Request {
  const headers: Record<string, string> = {};
  if (cookie) {
    headers.cookie = cookie;
  }
  return new Request(`${BASE}${path}`, { method: "GET", headers });
}

function sessionCookieFrom(res: Response): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = /tt_session=([^;]+)/.exec(setCookie);
  if (!match || !match[1]) {
    throw new Error("expected a session cookie on the response");
  }
  return `tt_session=${match[1]}`;
}

const validUser = {
  email: "ada@example.com",
  password: "very long secure pass",
  displayName: "Ada Lovelace"
};

describe("auth flow", () => {
  it("registers a new account, sets a session cookie, and returns the user", async () => {
    const res = await registerPost(jsonRequest("/api/auth/register", validUser));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { user: { email: string; displayName: string } };
    expect(body.user.email).toBe("ada@example.com");
    expect(body.user.displayName).toBe("Ada Lovelace");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("tt_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
  });

  it("normalizes email casing on registration", async () => {
    const res = await registerPost(
      jsonRequest("/api/auth/register", { ...validUser, email: "Ada@Example.COM" })
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { user: { email: string } };
    expect(body.user.email).toBe("ada@example.com");
  });

  it("rejects duplicate registration with a uniform error", async () => {
    await registerPost(jsonRequest("/api/auth/register", validUser));
    const res = await registerPost(jsonRequest("/api/auth/register", validUser));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).not.toMatch(/exists|taken|already/i);
  });

  it("rejects weak passwords", async () => {
    const res = await registerPost(
      jsonRequest("/api/auth/register", { ...validUser, password: "short" })
    );
    expect(res.status).toBe(400);
  });

  it("rejects invalid JSON bodies", async () => {
    const res = await registerPost(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "this is not json"
      })
    );
    expect(res.status).toBe(400);
  });

  it("logs in with correct credentials and rejects wrong ones uniformly", async () => {
    await registerPost(jsonRequest("/api/auth/register", validUser));

    const wrong = await loginPost(
      jsonRequest("/api/auth/login", { email: validUser.email, password: "wrong password" })
    );
    expect(wrong.status).toBe(400);

    const unknown = await loginPost(
      jsonRequest("/api/auth/login", { email: "nobody@example.com", password: "wrong password" })
    );
    expect(unknown.status).toBe(400);
    expect(((await unknown.json()) as { error: string }).error).toBe(
      ((await wrong.json()) as { error: string }).error
    );

    const right = await loginPost(
      jsonRequest("/api/auth/login", { email: validUser.email, password: validUser.password })
    );
    expect(right.status).toBe(200);
    expect(right.headers.get("set-cookie")).toContain("tt_session=");
  });

  it("protects /api/me and returns the user with a valid session", async () => {
    const anonymous = await meGet(getRequest("/api/me"));
    expect(anonymous.status).toBe(401);

    const registered = await registerPost(jsonRequest("/api/auth/register", validUser));
    const cookie = sessionCookieFrom(registered);

    const me = await meGet(getRequest("/api/me", cookie));
    expect(me.status).toBe(200);
    const body = (await me.json()) as { user: { email: string } };
    expect(body.user.email).toBe(validUser.email);
  });

  it("rejects garbage session tokens", async () => {
    const res = await meGet(getRequest("/api/me", "tt_session=garbage-token"));
    expect(res.status).toBe(401);
  });

  it("logout destroys the session server-side and clears the cookie", async () => {
    const registered = await registerPost(jsonRequest("/api/auth/register", validUser));
    const cookie = sessionCookieFrom(registered);

    const logout = await logoutPost(
      new Request(`${BASE}/api/auth/logout`, { method: "POST", headers: { cookie } })
    );
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");

    const afterLogout = await meGet(getRequest("/api/me", cookie));
    expect(afterLogout.status).toBe(401);
  });

  it("rate limits repeated login attempts per account", async () => {
    await registerPost(jsonRequest("/api/auth/register", validUser));
    let lastStatus = 0;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const res = await loginPost(
        jsonRequest("/api/auth/login", { email: validUser.email, password: "wrong password" })
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });

  it("health endpoint reports database connectivity", async () => {
    const res = await healthzGet();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; database: string };
    expect(body).toEqual({ status: "ok", database: "ok" });
  });
});
