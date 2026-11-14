import { NextResponse } from "next/server";
import { z } from "zod";
import { BaseError, getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import { mezoutAccountV2Abi, normalizePublicKey, splitPublicKey, type RecoveryAction } from "@mezout/sdk";
import { publicClient, relayerClient } from "@/lib/server/clients";
import { getDb } from "@/lib/server/db/client";
import { passkeyByAddress, relyingParty, verifyPasskeyAssertion } from "@/lib/server/passkeys";
import { clientIp, rateLimited, tooManyRequests } from "@/lib/server/rateLimit";
import {
  buildRecoveryOp,
  checkRecoveryAction,
  linkChallenge,
  linkRecoveredPasskey,
  readRecoveryStatus,
  RecoveryError,
} from "@/lib/server/recovery";
import { RelayerBusyError, sendAsRelayer } from "@/lib/server/relayerQueue";
import { checkFee, quoteOp, sponsorAndSend, WithdrawalError } from "@/lib/server/withdrawals";

const address = z.string().refine(isAddress, "invalid address").transform((v) => getAddress(v)) as unknown as z.ZodType<Address>;
const hex = z.string().refine((v) => isHex(v), "invalid hex") as unknown as z.ZodType<Hex>;
const publicKey = hex.refine((v) => {
  try {
    normalizePublicKey(v);
    return true;
  } catch {
    return false;
  }
}, "invalid public key");
const uint = z.string().regex(/^\d+$/).transform(BigInt);
const action: z.ZodType<RecoveryAction> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("setPasskey"), publicKey, delay: z.number().int() }),
  z.object({ type: z.literal("setAddress"), address, delay: z.number().int() }),
  z.object({ type: z.literal("remove") }),
  z.object({ type: z.literal("cancel") }),
]) as unknown as z.ZodType<RecoveryAction>;

const body = z.discriminatedUnion("step", [
  // The owner changes the recovery settings: quote returns the userOpHash for the owner passkey, submit relays it.
  z.object({ step: z.literal("quote"), account: address, action }),
  z.object({
    step: z.literal("submit"),
    account: address,
    action,
    nonce: uint,
    maxFeePerGas: uint,
    deployed: z.boolean(),
    signature: hex,
  }),
  // A lost passkey: the recovery signer's request starts it, anyone completes it after the delay, the new passkey links.
  z.object({ step: z.literal("start"), account: address, publicKey, signature: hex }),
  z.object({ step: z.literal("complete"), account: address }),
  z.object({ step: z.literal("link"), account: address, credentialId: z.string().min(1).max(1024), publicKey, signature: hex }),
]);

const notFound = () => NextResponse.json({ error: "Not a Mezout passkey account" }, { status: 404 });

// GET ?account=0x… returns the account's recovery settings, read from the chain. Public data only.
export async function GET(req: Request) {
  const wait = await rateLimited(`recovery-status:${clientIp(req)}`, 60, 60_000);
  if (wait) return tooManyRequests(wait);
  const raw = new URL(req.url).searchParams.get("account") ?? "";
  if (!isAddress(raw)) return NextResponse.json({ error: "invalid address" }, { status: 400 });
  const account = await passkeyByAddress(getDb(), getAddress(raw));
  if (!account) return notFound();
  return NextResponse.json(await readRecoveryStatus(publicClient(), account));
}

// Passkey account recovery. The relayer pays gas but never decides anything: owner changes need the owner passkey's
// signature over a user operation the server rebuilds, a recovery needs the recovery signer's signature (checked by the
// contract in simulation before anything is sent), and completing it only works once the on-chain delay has passed.
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const input = parsed.data;
  const accountAddress = input.account;
  const wait =
    (await rateLimited(`recovery-ip:${clientIp(req)}`, 20, 60_000)) || (await rateLimited(`recovery:${accountAddress}`, 10, 60_000));
  if (wait) return tooManyRequests(wait);

  const db = getDb();
  const account = await passkeyByAddress(db, accountAddress);
  if (!account) return notFound();
  const client = publicClient();

  try {
    if (input.step === "quote" || input.step === "submit") {
      const status = await readRecoveryStatus(client, account);
      await checkRecoveryAction(client, account, status, input.action);
      if (input.step === "quote") {
        const quote = await quoteOp(client, account);
        const { userOpHash } = await buildRecoveryOp(client, account, quote, input.action);
        return NextResponse.json({
          quote: { nonce: quote.nonce.toString(), maxFeePerGas: quote.maxFeePerGas.toString(), deployed: quote.deployed },
          userOpHash,
        });
      }
      await checkFee(client, input.maxFeePerGas);
      const quote = { nonce: input.nonce, maxFeePerGas: input.maxFeePerGas, deployed: input.deployed };
      const built = await buildRecoveryOp(client, account, quote, input.action);
      const signed = verifyPasskeyAssertion({
        publicKey: account.publicKey as Hex,
        challenge: built.userOpHash,
        signature: input.signature,
        ...relyingParty(req),
      });
      if (!signed) return NextResponse.json({ error: "The passkey signature does not match this change. Try again." }, { status: 400 });
      const hash = await sponsorAndSend(client, relayerClient(), built, input.signature);
      return NextResponse.json({ hash, userOpHash: built.userOpHash });
    }

    const wallet = relayerClient();
    if (input.step === "start" || input.step === "complete") {
      const args =
        input.step === "start"
          ? ({ functionName: "startRecovery", args: [splitPublicKey(input.publicKey).qx, splitPublicKey(input.publicKey).qy, input.signature] } as const)
          : ({ functionName: "completeRecovery", args: [] } as const);
      // Simulation runs the contract's own checks (signature, nonce, delay), so a bad request costs the relayer nothing.
      const { request } = await client
        .simulateContract({ account: wallet.account, address: accountAddress, abi: mezoutAccountV2Abi, ...args })
        .catch(() => {
          throw new RecoveryError(
            input.step === "start"
              ? "The recovery signature doesn't match this account's recovery method, or a recovery is already in progress."
              : "This recovery can't be finished yet.",
          );
        });
      const hash = await sendAsRelayer((nonce) => wallet.writeContract({ ...request, nonce }));
      return NextResponse.json({ hash });
    }

    // link: the new passkey owns the account on-chain; point Mezout's record at it.
    const [qx, qy] = await client.readContract({ address: accountAddress, abi: mezoutAccountV2Abi, functionName: "signer" });
    const signed = verifyPasskeyAssertion({
      publicKey: input.publicKey,
      challenge: linkChallenge(accountAddress, input.publicKey),
      signature: input.signature,
      ...relyingParty(req),
    });
    if (!signed) return NextResponse.json({ error: "The passkey signature doesn't match. Try again." }, { status: 400 });
    const row = await linkRecoveredPasskey(db, account, input, `0x${qx.slice(2)}${qy.slice(2)}`);
    return NextResponse.json({ address: row.accountAddress, publicKey: row.publicKey, credentialId: row.credentialId });
  } catch (err) {
    if (err instanceof RelayerBusyError) return NextResponse.json({ error: err.message }, { status: 503, headers: { "retry-after": "5" } });
    if (err instanceof RecoveryError || err instanceof WithdrawalError) {
      console.warn("recovery rejected", { step: input.step, reason: err.message, account: accountAddress });
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    // Never echo request bodies: they carry signatures.
    if (err instanceof BaseError) console.error("recovery failed", { step: input.step, short: err.shortMessage, details: err.details });
    return NextResponse.json({ error: "That didn't go through. Refresh and try again." }, { status: 422 });
  }
}
