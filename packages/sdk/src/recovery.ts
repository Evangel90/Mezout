import { encodeAbiParameters, encodeFunctionData, keccak256, type Address, type Hex } from "viem";
import { ERC7821_BATCH_MODE, splitPublicKey } from "./account";
import { mezoutAccountV2Abi } from "./abi/mezoutAccountV2";
import { mezoTestnet } from "./chains";

/** MezoutAccountV2's bounds on the recovery delay, in seconds (PasskeyRecovery.MIN/MAX_RECOVERY_DELAY). */
export const MIN_RECOVERY_DELAY = 2 * 86_400;
export const MAX_RECOVERY_DELAY = 30 * 86_400;
export const DEFAULT_RECOVERY_DELAY = MIN_RECOVERY_DELAY;

/** On-chain RecoveryKind: 0 none, 1 address, 2 passkey. */
export const RECOVERY_KIND = { none: 0, address: 1, passkey: 2 } as const;

export const startRecoveryTypes = {
  StartRecovery: [
    { name: "qx", type: "bytes32" },
    { name: "qy", type: "bytes32" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

/**
 * The EIP-712 request a recovery signer signs to hand `account` to `newPublicKey`. It is bound to the account (the
 * verifying contract), the chain and the account's current `recoveryNonce`, which every recovery change bumps.
 */
export function startRecoveryTypedData(account: Address, newPublicKey: Hex, nonce: bigint, chainId: number = mezoTestnet.id) {
  const { qx, qy } = splitPublicKey(newPublicKey);
  return {
    domain: { name: "MezoutAccount", version: "2", chainId, verifyingContract: account },
    types: startRecoveryTypes,
    primaryType: "StartRecovery",
    message: { qx, qy, nonce },
  } as const;
}

/**
 * The challenge a recovered account's new passkey signs so Mezout links it to the account (proof of possession; the
 * chain already says which key owns the account).
 */
export function recoveredPasskeyChallenge(account: Address, publicKey: Hex): Hex {
  const { qx, qy } = splitPublicKey(publicKey);
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }, { type: "bytes32" }, { type: "bytes32" }],
      ["Mezout recovered passkey", account, qx, qy],
    ),
  );
}

/** An owner action on the account's recovery settings, run as a call from the account itself. */
export type RecoveryAction =
  | { type: "setPasskey"; publicKey: Hex; delay: number }
  | { type: "setAddress"; address: Address; delay: number }
  | { type: "remove" }
  | { type: "cancel" };

/** The call on the account itself for `action` (what the account checks; the owner signs it wrapped in execute). */
export function encodeRecoveryCall(action: RecoveryAction): Hex {
  switch (action.type) {
    case "setPasskey": {
      const { qx, qy } = splitPublicKey(action.publicKey);
      return encodeFunctionData({ abi: mezoutAccountV2Abi, functionName: "setRecoveryPasskey", args: [qx, qy, BigInt(action.delay)] });
    }
    case "setAddress":
      return encodeFunctionData({ abi: mezoutAccountV2Abi, functionName: "setRecoveryAddress", args: [action.address, BigInt(action.delay)] });
    case "remove":
      return encodeFunctionData({ abi: mezoutAccountV2Abi, functionName: "removeRecoverySigner" });
    case "cancel":
      return encodeFunctionData({ abi: mezoutAccountV2Abi, functionName: "cancelRecovery" });
  }
}

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

/** MezoutAccountV2.execute calldata that runs `action` on the account itself (the owner passkey signs it). */
export function encodeRecoveryAction(account: Address, action: RecoveryAction): Hex {
  const batch = encodeAbiParameters(executionsType, [[{ target: account, value: 0n, callData: encodeRecoveryCall(action) }]]);
  return encodeFunctionData({ abi: mezoutAccountV2Abi, functionName: "execute", args: [ERC7821_BATCH_MODE, batch] });
}
