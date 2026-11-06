import { NextResponse, type NextRequest } from "next/server";

// Passkeys are bound to the domain they were created on, so the app lives on one canonical host. The first
// production domain permanently redirects there (308 keeps the method and body for API calls).
const LEGACY_HOSTS = new Set(["mezout-snowy.vercel.app"]);
const CANONICAL_HOST = "usemezout.vercel.app";

export async function middleware(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0];
  if (LEGACY_HOSTS.has(host)) {
    const url = req.nextUrl.clone();
    url.protocol = "https:";
    url.host = CANONICAL_HOST;
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  const match = req.nextUrl.pathname.match(/^\/pay\/([^/]+)$/);
  if (!match || req.nextUrl.searchParams.get("embed") !== "1") return NextResponse.next();

  // `frame-ancestors` must be on the checkout response itself. Resolve the signed link to the merchant's stored
  // allowlist through the Node API route because middleware runs at the edge and cannot connect to Postgres.
  let origins: string[] = [];
  try {
    const policyUrl = new URL("/api/embed-policy", req.url);
    policyUrl.searchParams.set("token", decodeURIComponent(match[1]));
    const policy = await fetch(policyUrl, { cache: "no-store" });
    const body = (await policy.json()) as { origins?: unknown };
    if (Array.isArray(body.origins)) origins = body.origins.filter((origin): origin is string => typeof origin === "string");
  } catch {
    // Fail closed: an unavailable policy lookup makes the checkout impossible to frame, while the normal URL works.
  }

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", `frame-ancestors ${origins.length ? origins.join(" ") : "'none'"}`);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
