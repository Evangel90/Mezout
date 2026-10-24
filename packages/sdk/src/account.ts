import {
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  isAddressEqual,
  numberToHex,
  type Address,
  type Hex,
} from "viem";
import { mezoutAccountAbi } from "./abi/mezoutAccount";
import { mezoTestnetAddresses } from "./addresses";

/** ERC-7821 single batch mode, the only mode MezoutAccount.execute accepts. */
export const ERC7821_BATCH_MODE: Hex = "0x0100000000000000000000000000000000000000000000000000000000000000";

const executionsType = [
  {
    type: "tuple[]",
    components: [
      { name: "target", type: "address" },
      { name: "value", type: "uint256" },
      { name: "callData", type: "bytes" },
    ],
  },
] as const;

/** Splits a 64-byte (x || y) or 65-byte (0x04 || x || y) P-256 public key into the factory's (qx, qy). */
export function splitPublicKey(publicKey: Hex): { qx: Hex; qy: Hex } {
  const hex = publicKey.slice(2).toLowerCase();
  const body = hex.length === 130 && hex.startsWith("04") ? hex.slice(2) : hex;
  if (!/^[0-9a-f]{128}$/.test(body)) throw new Error("Expected an uncompressed P-256 public key");
  return { qx: `0x${body.slice(0, 64)}`, qy: `0x${body.slice(64)}` };
}

/** Canonical storage form: 0x + x || y, lowercase, no prefix byte. */
export function normalizePublicKey(publicKey: Hex): Hex {
  const { qx, qy } = splitPublicKey(publicKey);
  return `0x${qx.slice(2)}${qy.slice(2)}`;
}

/** MezoutAccount.execute calldata that sends `amount` MUSD to `to`. */
export function encodeMusdWithdrawal(to: Address, amount: bigint): Hex {
  const transfer = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] });
  const batch = encodeAbiParameters(executionsType, [[{ target: mezoTestnetAddresses.musd, value: 0n, callData: transfer }]]);
  return encodeFunctionData({ abi: mezoutAccountAbi, functionName: "execute", args: [ERC7821_BATCH_MODE, batch] });
}

/** Returns the recipient and amount if `callData` is exactly one MUSD transfer and nothing else, otherwise null. */
export function decodeMusdWithdrawal(callData: Hex): { to: Address; amount: bigint } | null {
  try {
    const { functionName, args } = decodeFunctionData({ abi: mezoutAccountAbi, data: callData });
    if (functionName !== "execute" || args[0] !== ERC7821_BATCH_MODE) return null;
    const [calls] = decodeAbiParameters(executionsType, args[1]);
    if (calls.length !== 1) return null;
    const [call] = calls;
    if (!isAddressEqual(call.target, mezoTestnetAddresses.musd) || call.value !== 0n) return null;
    const transfer = decodeFunctionData({ abi: erc20Abi, data: call.callData });
    if (transfer.functionName !== "transfer") return null;
    const [to, amount] = transfer.args;
    // Re-encoding must reproduce the input exactly, so no trailing or non-canonical bytes slip through.
    if (encodeMusdWithdrawal(to, amount) !== callData.toLowerCase()) return null;
    return { to: getAddress(to), amount };
  } catch {
    return null;
  }
}

export type WebAuthnAssertion = {
  r: bigint;
  s: bigint;
  authenticatorData: Hex;
  clientDataJSON: string;
  challengeIndex: number;
  typeIndex: number;
};

const webAuthnAuthType = [
  { type: "bytes32" },
  { type: "bytes32" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "bytes" },
  { type: "string" },
] as const;

/** Encodes an assertion the way OpenZeppelin's WebAuthn.tryDecodeAuth reads it (MezoutAccount's signature format). */
export function encodeWebAuthnSignature(a: WebAuthnAssertion): Hex {
  return encodeAbiParameters(webAuthnAuthType, [
    numberToHex(a.r, { size: 32 }),
    numberToHex(a.s, { size: 32 }),
    BigInt(a.challengeIndex),
    BigInt(a.typeIndex),
    a.authenticatorData,
    a.clientDataJSON,
  ]);
}

export function decodeWebAuthnSignature(signature: Hex): WebAuthnAssertion {
  const [r, s, challengeIndex, typeIndex, authenticatorData, clientDataJSON] = decodeAbiParameters(
    webAuthnAuthType,
    signature,
  );
  return {
    r: BigInt(r),
    s: BigInt(s),
    challengeIndex: Number(challengeIndex),
    typeIndex: Number(typeIndex),
    authenticatorData,
    clientDataJSON,
  };
}
