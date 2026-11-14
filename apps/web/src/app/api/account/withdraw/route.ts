import { NextResponse } from "next/server";
import { z } from "zod";
import { BaseError, getAddress, isAddress, isHex, parseUnits, type Address, type Hex } from "viem";
import { publicClient, relayerClient } from "@/lib/server/clients";
import { getDb } from "@/lib/server/db/client";
import { passkeyByAddress, relyingParty, verifyPasskeyAssertion } from "@/lib/server/passkeys";
import { clientIp, rateLimited, tooManyRequests } from "@/lib/server/rateLimit";
import { RelayerBusyError } from "@/lib/server/relayerQueue";
import {
  accountFactory,
  buildWithdrawalOp,
  checkFee,
  quoteWithdrawal,
  sponsorAndSend,
  WithdrawalError,
  type WithdrawalQuote,
} from "@/lib/server/withdrawals";

const address = z.string().refine(isAddress, "invalid address") as unknown as z.ZodType<Address>;
const uint = z.string().regex(/^\d+$/).transform(BigInt);
const body = z.discriminatedUnion("step", [
  z.object({
    step: z.literal("quote"),
    account: address,
    to: address,
    amount: z.string().regex(/^\d+(\.\d{1,18})?$/, "amount must be a decimal MUSD value"),
  }),
  z.object({
    step: z.literal("submit"),
    account: address,
    to: address,
    amount: uint,
    nonce: uint,
    maxFeePerGas: uint,
    deployed: z.boolean(),
    signature: z.string().refine((v) => isHex(v), "invalid signature") as unknown as z.ZodType<Hex>,
  }),
]);

const quoteJson = (q: WithdrawalQuote) => ({
  to: q.to,
  amount: q.amount.toString(),
  nonce: q.nonce.toString(),
  maxFeePerGas: q.maxFeePerGas.toString(),
  deployed: q.deployed,
});

// Withdraws MUSD from a passkey MezoutAccount. Step 1 (quote) returns the userOpHash for the passkey to sign; step 2
// (submit) rebuilds the same operation, checks the passkey signature, sponsors gas and sends it through EntryPoint
// v0.7. The relayer only ever submits a single MUSD transfer out of a registered account.
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const input = parsed.data;
  const accountAddress = getAddress(input.account);
  const wait = (await rateLimited(`withdraw-ip:${clientIp(req)}`, 20, 60_000)) || (await rateLimited(`withdraw:${accountAddress}`, 10, 60_000));
  if (wait) return tooManyRequests(wait);

  const account = await passkeyByAddress(getDb(), accountAddress);
  if (!account) return NextResponse.json({ error: "Not a Mezout passkey account" }, { status: 404 });
  const client = publicClient();
  const to = getAddress(input.to);

  try {
    if (input.step === "quote") {
      const quote = await quoteWithdrawal(client, account, to, parseUnits(input.amount, 18));
      const { userOpHash } = buildWithdrawalOp(account, quote, quote.deployed ? undefined : await accountFactory(client, account));
      return NextResponse.json({ quote: quoteJson(quote), userOpHash });
    }

    await checkFee(client, input.maxFeePerGas);
    const quote: WithdrawalQuote = {
      to,
      amount: input.amount,
      nonce: input.nonce,
      maxFeePerGas: input.maxFeePerGas,
      deployed: input.deployed,
    };
    const built = buildWithdrawalOp(account, quote, quote.deployed ? undefined : await accountFactory(client, account));
    const { userOpHash } = built;
    const signed = verifyPasskeyAssertion({
      publicKey: account.publicKey as Hex,
      challenge: userOpHash,
      signature: input.signature,
      ...relyingParty(req),
    });
    if (!signed) {
      console.warn("withdraw rejected", { reason: "passkey signature mismatch", account: accountAddress });
      return NextResponse.json({ error: "The passkey signature does not match this withdrawal. Try again." }, { status: 400 });
    }

    const hash = await sponsorAndSend(client, relayerClient(), built, input.signature);
    return NextResponse.json({ hash, userOpHash });
  } catch (err) {
    if (err instanceof RelayerBusyError) return NextResponse.json({ error: err.message }, { status: 503, headers: { "retry-after": "5" } });
    if (err instanceof WithdrawalError) {
      console.warn("withdraw rejected", { step: input.step, reason: err.message, account: accountAddress });
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    // Never echo request bodies: they carry signatures.
    if (err instanceof BaseError) console.error("withdraw failed", { step: input.step, short: err.shortMessage, details: err.details });
    return NextResponse.json({ error: "The withdrawal could not be simulated. Get a new quote and try again." }, { status: 422 });
  }
}
