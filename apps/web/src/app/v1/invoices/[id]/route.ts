import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { mezoutRouterAbi } from "@mezout/sdk";
import { publicClient } from "@/lib/server/clients";
import { getDb } from "@/lib/server/db/client";
import { serverEnv } from "@/lib/server/env";
import { findInvoice, invoiceJson, invoiceStatus } from "@/lib/server/invoices";
import { apiError, requireMerchant } from "@/lib/server/v1";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const merchant = await requireMerchant(req);
  if (merchant instanceof NextResponse) return merchant;

  const row = await findInvoice(getDb(), merchant, params.id);
  if (!row) return apiError(404, "No such invoice");

  // The router is the source of truth for payment; this read is replaced by the indexer in M3.
  let paid: boolean;
  try {
    paid = await publicClient().readContract({
      address: serverEnv.router(),
      abi: mezoutRouterAbi,
      functionName: "paid",
      args: [row.orderId as Hex],
    });
  } catch {
    return apiError(503, "Could not read payment status from Mezo. Try again.");
  }
  return NextResponse.json(invoiceJson(row, merchant, invoiceStatus(row, paid), req.url), {
    headers: { "cache-control": "no-store" },
  });
}
