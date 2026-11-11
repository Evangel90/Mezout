import { NextResponse } from "next/server";
import { z } from "zod";
import type { Hex } from "viem";
import { MEZO_TESTNET_NETWORK } from "@mezout/sdk";
import { publicClient } from "@/lib/server/clients";
import { getDb } from "@/lib/server/db/client";
import { serverEnv } from "@/lib/server/env";
import { invoiceJson } from "@/lib/server/invoices";
import { syncIfStale } from "@/lib/server/sync";
import { apiError, parseJson, requireMerchant } from "@/lib/server/v1";
import { verifyInvoicePayment, type VerifyInput } from "@/lib/server/verify";

export const dynamic = "force-dynamic";

const txHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "transaction must be a 32-byte hex hash") as unknown as z.ZodType<Hex>;
const invoiceId = z.string().min(1).max(64);
const requirements = z
  .object({
    scheme: z.string().optional(),
    network: z.string().optional(),
    asset: z.string().optional(),
    amount: z.string().optional(),
    payTo: z.string().optional(),
    extra: z.object({ invoice: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

// Either Mezout's short form, or x402's facilitator form: {x402Version, paymentPayload, paymentRequirements}.
const simple = z.object({ invoice: invoiceId, transaction: txHash.optional() });
const x402 = z.object({
  x402Version: z.literal(2),
  paymentPayload: z
    .object({ payload: z.object({ invoice: invoiceId.optional(), transaction: txHash.optional() }).passthrough() })
    .passthrough(),
  paymentRequirements: requirements,
});

function toInput(raw: unknown): VerifyInput | string {
  const x = x402.safeParse(raw);
  if (x.success) {
    const invoice = x.data.paymentPayload.payload.invoice ?? x.data.paymentRequirements.extra?.invoice;
    if (!invoice) return "paymentPayload.payload.invoice is required";
    return { invoice, transaction: x.data.paymentPayload.payload.transaction, requirements: x.data.paymentRequirements };
  }
  const s = simple.safeParse(raw);
  if (s.success) return s.data;
  const issue = s.error.issues[0];
  return issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid request";
}

/**
 * Tells a merchant's server whether one of its invoices is paid, so it can release what the payment bought (an HTTP
 * 402 paywall, typically). Read-only: it records nothing, so the caller must accept each invoice once.
 */
export async function POST(req: Request) {
  const merchant = await requireMerchant(req);
  if (merchant instanceof NextResponse) return merchant;

  const input = toInput(parseJson(await req.text()));
  if (typeof input === "string") return apiError(400, input);

  const result = await verifyInvoicePayment(getDb(), merchant, input, publicClient(), { sync: () => syncIfStale(5_000) });
  if (!result.found) return apiError(404, "No such invoice");

  const invoice = invoiceJson(result.view, merchant, serverEnv.appUrl());
  const body = result.isValid
    ? {
        object: "verification",
        isValid: true,
        payer: result.payment.payer,
        network: MEZO_TESTNET_NETWORK,
        transaction: result.payment.tx_hash,
        payment: result.payment,
        invoice,
      }
    : {
        object: "verification",
        isValid: false,
        invalidReason: result.invalidReason,
        message: result.detail,
        network: MEZO_TESTNET_NETWORK,
        invoice,
      };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
