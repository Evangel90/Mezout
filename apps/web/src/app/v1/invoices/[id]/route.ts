import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db/client";
import { findInvoiceView, invoiceJson } from "@/lib/server/invoices";
import { syncIfStale } from "@/lib/server/sync";
import { apiError, requireMerchant } from "@/lib/server/v1";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const merchant = await requireMerchant(req);
  if (merchant instanceof NextResponse) return merchant;

  const db = getDb();
  let view = await findInvoiceView(db, merchant, params.id);
  if (!view) return apiError(404, "No such invoice");

  // Status comes only from indexed Paid events. If the indexer has not run for a few seconds, catch it up first so
  // a poll right after checkout sees the payment.
  if (!view.payment && view.row.expiresAt.getTime() > Date.now() - 10 * 60_000) {
    const synced = await syncIfStale(5_000).catch(() => null);
    if (synced?.recorded) view = (await findInvoiceView(db, merchant, params.id)) ?? view;
  }
  return NextResponse.json(invoiceJson(view, merchant, req.url), { headers: { "cache-control": "no-store" } });
}
