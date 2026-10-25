import { NextResponse } from "next/server";
import { z } from "zod";
import { isHex, type Hex } from "viem";
import { publicClient } from "@/lib/server/clients";
import { getDb } from "@/lib/server/db/client";
import { serverEnv } from "@/lib/server/env";
import { completeRefund, refundJson, RefundError } from "@/lib/server/refunds";
import { deliverWebhooks } from "@/lib/server/sync";
import { apiError, requireSession } from "@/lib/server/v1";
import { waitUntil } from "@vercel/functions";

const body = z.object({
  payment: z.string().min(1),
  tx_hash: z.string().refine((v) => isHex(v) && v.length === 66, "invalid transaction hash") as unknown as z.ZodType<Hex>,
  refund: z.string().optional(),
});

/** Records a refund the merchant just sent from the dashboard, after checking the transfer on-chain. */
export async function POST(req: Request) {
  const merchant = await requireSession(req);
  if (merchant instanceof NextResponse) return merchant;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, parsed.error.issues[0]?.message ?? "Invalid request");
  try {
    const refund = await completeRefund(
      getDb(),
      merchant,
      publicClient(),
      { paymentId: parsed.data.payment, txHash: parsed.data.tx_hash, refundId: parsed.data.refund },
      serverEnv.appUrl(),
    );
    waitUntil(deliverWebhooks(10).catch((err) => console.error("webhook delivery failed", err)));
    return NextResponse.json(refundJson(refund, null), { status: 201 });
  } catch (err) {
    if (err instanceof RefundError) return apiError(err.status, err.message);
    throw err;
  }
}
