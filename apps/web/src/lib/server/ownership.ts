import "server-only";
import { hashMessage, type Address, type Hex } from "viem";
import type { VerifySignature } from "./apiKeys";
import { publicClient } from "./clients";
import type { Db } from "./db/client";
import { passkeyByAddress, relyingParty, verifyPasskeyAssertion } from "./passkeys";

// The merchant proves control of the payout address by signing a Mezout message. verifyMessage also accepts
// ERC-1271 / ERC-6492 signatures, so Passport smart accounts (Bitcoin wallets) work too. Mezout passkey accounts sign
// the message's EIP-191 hash with their passkey, checked against the stored public key.
export async function ownershipVerifier(db: Db, req: Request, address: Address): Promise<VerifySignature> {
  const passkey = await passkeyByAddress(db, address);
  if (passkey) {
    return async ({ message, signature }) =>
      verifyPasskeyAssertion({
        publicKey: passkey.publicKey as Hex,
        challenge: hashMessage(message),
        signature,
        ...relyingParty(req),
      });
  }
  const client = publicClient();
  return (args) => client.verifyMessage(args);
}
