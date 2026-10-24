import { NextResponse } from "next/server";
import { z } from "zod";
import { BaseError, ContractFunctionRevertedError, getAddress, isAddress, isHex, type Hex } from "viem";
import { decodeSignedInvoice, getBorrowHints, mezoutRouterAbi } from "@mezout/sdk";
import { publicClient, relayerClient } from "@/lib/server/clients";
import { serverEnv } from "@/lib/server/env";
import { clientIp, rateLimited } from "@/lib/server/rateLimit";

const hex = z.string().refine((v) => isHex(v), "invalid hex") as unknown as z.ZodType<Hex>;
const uint = z.string().regex(/^\d+$/).transform(BigInt);
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected 32 bytes") as unknown as z.ZodType<Hex>;
const permit = z.object({ deadline: uint, v: z.number().int().min(0).max(255), r: bytes32, s: bytes32 });

const body = z.discriminatedUnion("method", [
  z.object({ method: z.literal("MUSD"), token: z.string(), payer: z.string(), payerSig: hex, permit }),
  z.object({
    method: z.literal("BORROW"),
    token: z.string(),
    payer: z.string(),
    payerSig: hex,
    fromBalance: uint,
    permit,
    borrow: z.object({ deadline: uint, signature: hex }),
  }),
]);

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isAddress(parsed.data.payer)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const input = parsed.data;
  const payer = getAddress(input.payer);
  if (rateLimited(`relay-ip:${clientIp(req)}`, 10, 60_000) || rateLimited(`relay-payer:${payer}`, 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let signed;
  try {
    signed = decodeSignedInvoice(input.token);
  } catch {
    return NextResponse.json({ error: "Invalid payment link" }, { status: 400 });
  }
  const { invoice, signature: invoiceSig } = signed;
  const router = serverEnv.router();
  const client = publicClient();
  const wallet = relayerClient();

  try {
    let hash: Hex;
    if (input.method === "MUSD") {
      const { request } = await client.simulateContract({
        account: wallet.account,
        address: router,
        abi: mezoutRouterAbi,
        functionName: "payWithMUSD",
        args: [invoice, invoiceSig, payer, input.payerSig, input.permit],
      });
      hash = await wallet.writeContract(request);
    } else {
      const borrowed = invoice.amount - input.fromBalance;
      const hints = await getBorrowHints(client, payer, borrowed);
      const { request } = await client.simulateContract({
        account: wallet.account,
        address: router,
        abi: mezoutRouterAbi,
        functionName: "payWithBorrow",
        args: [
          invoice,
          invoiceSig,
          payer,
          input.payerSig,
          input.fromBalance,
          input.permit,
          { deadline: input.borrow.deadline, ...hints, signature: input.borrow.signature },
        ],
      });
      hash = await wallet.writeContract(request);
    }
    return NextResponse.json({ hash });
  } catch (err) {
    // Never echo request bodies: they carry signatures.
    return NextResponse.json({ error: revertMessage(err) }, { status: 422 });
  }
}

const REVERT_MESSAGES: Record<string, string> = {
  InvoiceAlreadyPaid: "This invoice has already been paid.",
  InvoiceExpired: "This payment link has expired.",
  InvalidInvoiceSignature: "This payment link is not valid.",
  InvalidPayerSignature: "Your payment signature did not match this invoice.",
  PermitFailed: "The MUSD permit was not accepted. Please sign again.",
  TroveBelowSafetyFloor: "This would take your loan below the 160% safety floor.",
  BorrowMismatch: "The borrowed amount did not match. Nothing was charged.",
  InvalidBorrowAmount: "Use Pay with MUSD when your balance covers the invoice.",
};

function revertMessage(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && REVERT_MESSAGES[name]) return REVERT_MESSAGES[name];
      if (revert.reason) return revert.reason;
    }
    return err.shortMessage;
  }
  return "The payment could not be simulated.";
}
