import { NextResponse, type NextRequest } from "next/server";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Edge middleware:
 * 1. Cross-origin write rejection (CSRF defense alongside SameSite cookies —
 *    browsers always attach Origin to cross-origin mutating requests).
 * 2. Nonce-based Content-Security-Policy: a fresh nonce per request, passed
 *    to Next via the request CSP header (which Next applies to its inline
 *    scripts) and emitted on the response. Production script-src carries no
 *    'unsafe-inline' — only 'self', the nonce, and 'strict-dynamic'.
 * 3. Fast redirect for unauthenticated visits to protected pages; the
 *    authoritative session check remains server-side in layouts and routes.
 */
export function middleware(req: NextRequest) {
  if (MUTATING_METHODS.has(req.method)) {
    const origin = req.headers.get("origin");
    if (origin) {
      const host = req.headers.get("host");
      let originHost: string | null;
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = null;
      }
      if (!originHost || originHost !== host) {
        return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
      }
    }
  }

  const path = req.nextUrl.pathname;
  const isProtectedPage = path === "/app" || path.startsWith("/app/");
  if (isProtectedPage && !req.cookies.get("tt_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("from", path);
    return NextResponse.redirect(url);
  }

  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = btoa(String.fromCharCode(...nonceBytes));
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    // Dev needs eval for React Fast Refresh; production gets nonce + strict-dynamic only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Next.js injects inline style attributes for rendering; styles remain
    // same-origin files plus inline (documented tradeoff, D-0020).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
  ].join("; ");

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"]
};
