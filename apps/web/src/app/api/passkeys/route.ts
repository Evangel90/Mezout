import { NextResponse } from "next/server";
import { z } from "zod";
import { isHex, type Hex } from "viem";
import { mezoTestnetAddresses, mezoutAccountFactoryAbi } from "@mezout/sdk";
import { publicClient } from "@/lib/server/clients";
import { getDb } from "@/lib/server/db/client";
import { PasskeyError, registerPasskey } from "@/lib/server/passkeys";
import { clientIp, rateLimited, tooManyRequests } from "@/lib/server/rateLimit";

const body = z.object({
  credentialId: z.string().min(1).max(1024),
  publicKey: z.string().refine((v) => isHex(v), "invalid public key") as unknown as z.ZodType<Hex>,
});

// Registers a new passkey and returns its MezoutAccount address. No proof of possession is needed: the address is
// derived from the public key, so only the holder of the matching private key can ever move funds out of it.
export async function POST(req: Request) {
  const wait = await rateLimited(`passkeys:${clientIp(req)}`, 10, 60_000);
  if (wait) return tooManyRequests(wait);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const client = publicClient();
  try {
    const row = await registerPasskey(getDb(), parsed.data, async (qx, qy) => {
      // Simulating createAccount runs the contract's own key check (P256.isValidPublicKey) and returns the address.
      const { result } = await client.simulateContract({
        address: mezoTestnetAddresses.mezoutAccountFactory,
        abi: mezoutAccountFactoryAbi,
        functionName: "createAccount",
        args: [qx, qy],
      });
      return result;
    });
    return NextResponse.json({ address: row.accountAddress, publicKey: row.publicKey }, { status: 201 });
  } catch (err) {
    if (err instanceof PasskeyError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
