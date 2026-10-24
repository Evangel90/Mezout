import { P256, PublicKey } from "ox";
import { concat, sha256, stringToBytes, type Hex } from "viem";
import { encodeWebAuthnSignature } from "@mezout/sdk";

const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

/** A software passkey: signs WebAuthn assertions the way a browser and authenticator do. */
export function softPasskey(rpId = "mezout.test", origin = `https://${rpId}`) {
  const privateKey = P256.randomPrivateKey();
  const publicKey = PublicKey.toHex(P256.getPublicKey({ privateKey }), { includePrefix: false });
  function sign(challenge: Hex, opts: { flags?: number; type?: string; highS?: boolean; origin?: string; rpId?: string } = {}) {
    const b64 = Buffer.from(challenge.slice(2), "hex").toString("base64url");
    const clientDataJSON = `{"type":"${opts.type ?? "webauthn.get"}","challenge":"${b64}","origin":"${opts.origin ?? origin}","crossOrigin":false}`;
    const flags = `0x${(opts.flags ?? 0x05).toString(16).padStart(2, "0")}` as Hex;
    const authenticatorData = concat([sha256(stringToBytes(opts.rpId ?? rpId)), flags, "0x00000000"]);
    const digest = sha256(concat([authenticatorData, sha256(stringToBytes(clientDataJSON))]));
    const sig = P256.sign({ payload: digest, privateKey, hash: false });
    const low = sig.s > N / 2n ? N - sig.s : sig.s;
    return encodeWebAuthnSignature({
      r: sig.r,
      s: opts.highS ? N - low : low,
      authenticatorData,
      clientDataJSON,
      challengeIndex: clientDataJSON.indexOf('"challenge"'),
      typeIndex: clientDataJSON.indexOf('"type"'),
    });
  }
  return { publicKey, sign, credentialId: Buffer.from(publicKey.slice(2, 34), "hex").toString("base64url") };
}
