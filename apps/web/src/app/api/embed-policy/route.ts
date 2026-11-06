import { NextResponse } from "next/server";
import { decodeSignedInvoice } from "@mezout/sdk";
import { getDb } from "@/lib/server/db/client";
import { checkoutDetails } from "@/lib/server/profile";

// Called by middleware for an embedded checkout. The token is already present in the checkout URL; this endpoint
// only returns the origins the merchant approved and grants no payment or merchant capability.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ origins: [] });
  try {
    const { invoice } = decodeSignedInvoice(token);
    const details = await checkoutDetails(getDb(), token, invoice.merchant);
    return NextResponse.json({ origins: details.embedOrigins }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({ origins: [] });
  }
}
