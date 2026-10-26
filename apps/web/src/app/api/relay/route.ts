import { NextResponse } from "next/server";
import { z } from "zod";
import { BaseError, ContractFunctionRevertedError, getAddress, isAddress, isAddressEqual, isHex, type Hex } from "viem";
import { decodeSignedInvoice, getBorrowHints, linkRouter, mezoTestnetAddresses, mezoutRouterAbi } from "@mezout/sdk";
import { publicClient, relayerClient } from "@/lib/server/clients";
import { serverEnv } from "@/lib/server/env";
import { clientIp, rateLimited, tooManyRequests } from "@/lib/server/rateLimit";

const hex = z.string().refine((v) => isHex(v), "invalid hex") as unknown as z.ZodType<Hex>;
const uint = z.string().regex(/^\d+$/).transform(BigInt);
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected 32 bytes") as unknown as z.ZodType<Hex>;
const permit = z.object({ deadline: uint, v: z.number().int().min(0).max(255), r: bytes32, s: bytes32 });

// Some Mezo RPC nodes estimate below their own EIP-7623 calldata floor; observed use is ~139k (MUSD) and ~514k (BORROW).
// Swaps use ~260k in fork tests.
const MIN_GAS = { MUSD: 300_000n, BORROW: 1_000_000n, MEZO: 600_000n, BTC: 600_000n } as const;
const gasLimit = (estimate: bigint, method: keyof typeof MIN_GAS) => {
  const bumped = (estimate * 13n) / 10n;
  return bumped > MIN_GAS[method] ? bumped : MIN_GAS[method];
};

const swapBody = <M extends "MEZO" | "BTC">(method: M) =>
  z.object({
    method: z.literal(method),
    token: z.string(),
    payer: z.string(),
    payerSig: hex,
    limit: z.object({ maxAmountIn: uint, deadline: uint }),
    permit,
  });

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
  swapBody("MEZO"),
  swapBody("BTC"),
]);

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isAddress(parsed.data.payer)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const input = parsed.data;
  const payer = getAddress(input.payer);
  const wait = (await rateLimited(`relay-ip:${clientIp(req)}`, 10, 60_000)) || (await rateLimited(`relay-payer:${payer}`, 5, 60_000));
  if (wait) return tooManyRequests(wait);

  let signed;
  try {
    signed = decodeSignedInvoice(input.token);
  } catch {
    return NextResponse.json({ error: "Invalid payment link" }, { status: 400 });
  }
  const { invoice, signature: invoiceSig } = signed;
  // Only our own routers: the current one, and the first one for links signed before swaps existed.
  const router = linkRouter(signed);
  const current = serverEnv.router();
  const isCurrent = isAddressEqual(router, current);
  if (!isCurrent && !isAddressEqual(router, mezoTestnetAddresses.mezoutRouterV1)) {
    return NextResponse.json({ error: "This payment link is not valid." }, { status: 400 });
  }
  if ((input.method === "MEZO" || input.method === "BTC") && !isCurrent) {
    return NextResponse.json({ error: "This link was made before MEZO and BTC payments. Pay with MUSD." }, { status: 400 });
  }
  const client = publicClient();
  const wallet = relayerClient();

  try {
    const base = { account: wallet.account, address: router, abi: mezoutRouterAbi } as const;
    const gas = (estimate: bigint) => gasLimit(estimate, input.method);
    let hash: Hex;
    if (input.method === "MUSD") {
      const call = {
        ...base,
        functionName: "payWithMUSD",
        args: [invoice, invoiceSig, payer, input.payerSig, input.permit],
      } as const;
      const estimate = await client.estimateContractGas(call).catch(() => 0n);
      const { request } = await client.simulateContract({ ...call, gas: gas(estimate) });
      hash = await wallet.writeContract(request);
    } else if (input.method === "BORROW") {
      const hints = await getBorrowHints(client, payer, invoice.amount - input.fromBalance);
      const call = {
        ...base,
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
      } as const;
      const estimate = await client.estimateContractGas(call).catch(() => 0n);
      const { request } = await client.simulateContract({ ...call, gas: gas(estimate) });
      hash = await wallet.writeContract(request);
    } else {
      const call = {
        ...base,
        functionName: input.method === "MEZO" ? "payWithMEZO" : "payWithBTC",
        args: [invoice, invoiceSig, payer, input.payerSig, input.limit, input.permit],
      } as const;
      const estimate = await client.estimateContractGas(call).catch(() => 0n);
      const { request } = await client.simulateContract({ ...call, gas: gas(estimate) });
      hash = await wallet.writeContract(request);
    }
    return NextResponse.json({ hash });
  } catch (err) {
    // Never echo request bodies: they carry signatures.
    if (err instanceof BaseError) {
      console.error("relay failed", { method: input.method, name: err.name, short: err.shortMessage, details: err.details });
    }
    return NextResponse.json({ error: revertMessage(err) }, { status: 422 });
  }
}

const REVERT_MESSAGES: Record<string, string> = {
  InvoiceAlreadyPaid: "This invoice has already been paid.",
  InvoiceExpired: "This payment link has expired.",
  InvalidInvoiceSignature: "This payment link is not valid.",
  InvalidPayerSignature: "Your payment signature did not match this invoice.",
  PermitFailed: "The token permit was not accepted. Please sign again.",
  TroveBelowSafetyFloor: "This would take your loan below the 160% safety floor.",
  BorrowMismatch: "The borrowed amount did not match. Nothing was charged.",
  InvalidBorrowAmount: "Use Pay with MUSD when your balance covers the invoice.",
  SlippageExceeded: "The price moved past your limit. Nothing was charged; please try again.",
  QuoteExpired: "The price quote expired. Please try again.",
  NoPool: "That token cannot be swapped to MUSD right now.",
  InsufficientLiquidity: "There is not enough liquidity to swap for this amount.",
  SwapMismatch: "The swap returned the wrong amount. Nothing was charged.",
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
