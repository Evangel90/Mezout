import { NextResponse } from "next/server";
import { z } from "zod";
import { BaseError, ContractFunctionRevertedError, getAddress, isAddress, isAddressEqual, isHex, type Hex } from "viem";
import {
  decodeSignedInvoice,
  getBorrowHints,
  linkRouter,
  mezoTestnetAddresses,
  mezoutAgentWalletAbi,
  mezoutAgentWalletFactoryAbi,
  mezoutRouterAbi,
} from "@mezout/sdk";
import { agentWalletFactory, serverNetwork } from "@/lib/server/network";
import { publicClient, relayerClient } from "@/lib/server/clients";
import { serverEnv } from "@/lib/server/env";
import { clientIp, rateLimited, tooManyRequests } from "@/lib/server/rateLimit";
import { RelayerBusyError, sendAsRelayer } from "@/lib/server/relayerQueue";

const hex = z.string().refine((v) => isHex(v), "invalid hex") as unknown as z.ZodType<Hex>;
const uint = z.string().regex(/^\d+$/).transform(BigInt);
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected 32 bytes") as unknown as z.ZodType<Hex>;
const permit = z.object({ deadline: uint, v: z.number().int().min(0).max(255), r: bytes32, s: bytes32 });

// Some Mezo RPC nodes estimate below their own EIP-7623 calldata floor; observed use is ~139k (MUSD) and ~514k (BORROW).
// Swaps use ~260k in fork tests.
// Agent-wallet payments add the wallet's checks to a MUSD payment: up to ~250k in unit tests with a mock MUSD.
const MIN_GAS = { MUSD: 300_000n, BORROW: 1_000_000n, MEZO: 600_000n, BTC: 600_000n, AGENT_WALLET: 450_000n } as const;
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

const agentWalletBody = z.object({ method: z.literal("AGENT_WALLET"), token: z.string(), wallet: z.string(), agent: z.string(), agentSig: hex });

// The wallet's own errors plus the router's, which bubble up through `pay`.
const agentWalletCallAbi = [...mezoutAgentWalletAbi, ...mezoutRouterAbi.filter((x) => x.type === "error")] as const;

/**
 * A payment from a MezoutAgentWallet, signed by one of its session keys. The relayer only pays gas: the wallet checks
 * the session key's signature and the owner's limits on-chain, then pays through the router as payer. Only wallets
 * from our factory, paying through the current router, are relayed, so no other contract can spend the relayer's gas.
 */
async function relayAgentWallet(raw: unknown, req: Request) {
  const factory = agentWalletFactory();
  if (!factory) return NextResponse.json({ error: "Agent wallets are not enabled on this relay." }, { status: 400 });
  const parsed = agentWalletBody.safeParse(raw);
  if (!parsed.success || !isAddress(parsed.data.wallet) || !isAddress(parsed.data.agent)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const wallet = getAddress(parsed.data.wallet);
  const agent = getAddress(parsed.data.agent);
  const wait = (await rateLimited(`relay-ip:${clientIp(req)}`, 10, 60_000)) || (await rateLimited(`relay-payer:${wallet}`, 5, 60_000));
  if (wait) return tooManyRequests(wait);

  let signed;
  try {
    signed = decodeSignedInvoice(parsed.data.token);
  } catch {
    return NextResponse.json({ error: "Invalid payment link" }, { status: 400 });
  }
  const router = linkRouter(signed);
  if (!isAddressEqual(router, serverEnv.router())) {
    return NextResponse.json({ error: "Agent wallets pay links made for the current router only." }, { status: 400 });
  }
  const client = publicClient();
  const relayer = relayerClient();
  try {
    const known = await client.readContract({ address: factory, abi: mezoutAgentWalletFactoryAbi, functionName: "isWallet", args: [wallet] });
    if (!known) return NextResponse.json({ error: "Not a Mezout agent wallet." }, { status: 400 });
    const walletRouter = await client.readContract({ address: wallet, abi: mezoutAgentWalletAbi, functionName: "router" });
    if (!isAddressEqual(walletRouter, router)) {
      return NextResponse.json({ error: "The agent wallet pays through a different router than this link." }, { status: 400 });
    }
    const call = {
      account: relayer.account,
      address: wallet,
      abi: agentWalletCallAbi,
      functionName: "pay",
      args: [signed.invoice, signed.signature, agent, parsed.data.agentSig],
    } as const;
    const estimate = await client.estimateContractGas(call).catch(() => 0n);
    const { request } = await client.simulateContract({ ...call, gas: gasLimit(estimate, "AGENT_WALLET") });
    const hash = await sendAsRelayer((nonce) => relayer.writeContract({ ...request, nonce }));
    return NextResponse.json({ hash });
  } catch (err) {
    if (err instanceof RelayerBusyError) return NextResponse.json({ error: err.message }, { status: 503, headers: { "retry-after": "5" } });
    if (err instanceof BaseError) {
      console.error("relay failed", { method: "AGENT_WALLET", name: err.name, short: err.shortMessage, details: err.details });
    }
    return NextResponse.json({ error: revertMessage(err) }, { status: 422 });
  }
}

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  if ((raw as { method?: unknown } | null)?.method === "AGENT_WALLET") return relayAgentWallet(raw, req);
  const parsed = body.safeParse(raw);
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
  // Only our own routers: the current one, v1 (links signed before swaps existed) and v2 (links signed before v3).
  const { network } = serverNetwork();
  let router;
  try {
    router = linkRouter(signed, network);
  } catch {
    return NextResponse.json({ error: "This payment link is not valid." }, { status: 400 });
  }
  const current = serverEnv.router();
  const isCurrent = isAddressEqual(router, current);
  // v1 and v2 are testnet routers; on mainnet only the current router is honoured.
  const testnet = network === "testnet";
  const isV2 = testnet && isAddressEqual(router, mezoTestnetAddresses.mezoutRouterV2);
  if (!isCurrent && !isV2 && !(testnet && isAddressEqual(router, mezoTestnetAddresses.mezoutRouterV1))) {
    return NextResponse.json({ error: "This payment link is not valid." }, { status: 400 });
  }
  if ((input.method === "MEZO" || input.method === "BTC") && !isCurrent && !isV2) {
    return NextResponse.json({ error: "This link was made before MEZO and BTC payments. Pay with MUSD." }, { status: 400 });
  }
  // v1 and v2 borrows send the MUSD to the router, so a copied borrow signature can strand it there. Only the current
  // router borrows straight to the payer.
  if (input.method === "BORROW" && !isCurrent) {
    return NextResponse.json({ error: "This link was made before the current checkout. Pay with MUSD." }, { status: 400 });
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
      hash = await sendAsRelayer((nonce) => wallet.writeContract({ ...request, nonce }));
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
      hash = await sendAsRelayer((nonce) => wallet.writeContract({ ...request, nonce }));
    } else {
      const call = {
        ...base,
        functionName: input.method === "MEZO" ? "payWithMEZO" : "payWithBTC",
        args: [invoice, invoiceSig, payer, input.payerSig, input.limit, input.permit],
      } as const;
      const estimate = await client.estimateContractGas(call).catch(() => 0n);
      const { request } = await client.simulateContract({ ...call, gas: gas(estimate) });
      hash = await sendAsRelayer((nonce) => wallet.writeContract({ ...request, nonce }));
    }
    return NextResponse.json({ hash });
  } catch (err) {
    if (err instanceof RelayerBusyError) return NextResponse.json({ error: err.message }, { status: 503, headers: { "retry-after": "5" } });
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
  AgentNotApproved: "This session key is not approved on the agent wallet, or was revoked.",
  SessionExpired: "This session key's approval on the agent wallet has expired.",
  InvalidAgentSignature: "The session key's signature did not match this invoice and wallet.",
  MerchantNotAllowed: "The agent wallet's owner has not allowed this merchant.",
  OverPaymentLimit: "This payment is over the agent wallet's per-payment limit.",
  OverDailyLimit: "This payment would pass the agent wallet's daily limit.",
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
