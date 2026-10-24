import { NextResponse } from "next/server";
import { z } from "zod";
import { hashMessage, isAddress, isHex, type Address, type Hex } from "viem";
import { getDb } from "@/lib/server/db/client";
import { issueApiKey, KeyRequestError, type VerifySignature } from "@/lib/server/apiKeys";
import { publicClient } from "@/lib/server/clients";
import { passkeyByAddress, relyingParty, verifyPasskeyAssertion } from "@/lib/server/passkeys";
import { clientIp, rateLimited } from "@/lib/server/rateLimit";

const body = z.object({
  address: z.string().refine(isAddress, "invalid address") as unknown as z.ZodType<Address>,
  issuedAt: z.string(),
  signature: z.string().refine((v) => isHex(v), "invalid signature") as unknown as z.ZodType<Hex>,
});

// The merchant proves control of the payout address by signing keyRequestMessage. verifyMessage also
// accepts ERC-1271 / ERC-6492 signatures, so Passport smart accounts (Bitcoin wallets) work too. Mezout passkey
// accounts sign the same message's EIP-191 hash with their passkey, checked against the stored public key.
export async function POST(req: Request) {
  if (rateLimited(`keys:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const db = getDb();
  const client = publicClient();
  const passkey = await passkeyByAddress(db, parsed.data.address);
  const verify: VerifySignature = passkey
    ? async ({ message, signature }) =>
        verifyPasskeyAssertion({
          publicKey: passkey.publicKey as Hex,
          challenge: hashMessage(message),
          signature,
          ...relyingParty(req),
        })
    : (args) => client.verifyMessage(args);
  try {
    const { key, prefix, merchant } = await issueApiKey(db, parsed.data, verify);
    return NextResponse.json({ key, prefix, merchant: merchant.payoutAddress }, { status: 201 });
  } catch (err) {
    if (err instanceof KeyRequestError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
