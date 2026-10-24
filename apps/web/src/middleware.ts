import { NextResponse, type NextRequest } from "next/server";

// Passkeys are bound to the domain they were created on, so the app lives on one canonical host. The first
// production domain permanently redirects there (308 keeps the method and body for API calls).
const LEGACY_HOSTS = new Set(["mezout-snowy.vercel.app"]);
const CANONICAL_HOST = "usemezout.vercel.app";

export function middleware(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0];
  if (!LEGACY_HOSTS.has(host)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.protocol = "https:";
  url.host = CANONICAL_HOST;
  url.port = "";
  return NextResponse.redirect(url, 308);
}
