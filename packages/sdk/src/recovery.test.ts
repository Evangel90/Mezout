import { describe, expect, it } from "vitest";
import { P256, PublicKey } from "ox";
import { decodeAbiParameters, decodeFunctionData, hashTypedData, type Address, type Hex } from "viem";
import { ERC7821_BATCH_MODE } from "./account";
import { mezoutAccountV2Abi } from "./abi/mezoutAccountV2";
import { encodeRecoveryAction, startRecoveryTypedData } from "./recovery";

const account: Address = "0x1111111111111111111111111111111111111111";
// Key 0x4E3, the "new device" passkey in contracts/test/unit/MezoutAccountRecovery.t.sol.
const newKey = PublicKey.toHex(P256.getPublicKey({ privateKey: "0x00000000000000000000000000000000000000000000000000000000000004e3" }), {
  includePrefix: false,
});
// Pinned in contracts/test/unit/MezoutAccountRecovery.t.sol (test_requestHash_pinnedVector), built there from first
// principles, so the dashboard and the contract agree on what a recovery signer signs.
const PINNED_HASH: Hex = "0x3f09aa37eacfebabfc42f21e71df105157d65f58925a9fcd73dec50c52e2da02";

describe("startRecoveryTypedData", () => {
  it("matches the contract's EIP-712 hash", () => {
    expect(hashTypedData(startRecoveryTypedData(account, newKey, 7n, 31611))).toBe(PINNED_HASH);
  });

  it("binds the account, chain and nonce", () => {
    const base = hashTypedData(startRecoveryTypedData(account, newKey, 7n, 31611));
    expect(hashTypedData(startRecoveryTypedData("0x2222222222222222222222222222222222222222", newKey, 7n, 31611))).not.toBe(base);
    expect(hashTypedData(startRecoveryTypedData(account, newKey, 8n, 31611))).not.toBe(base);
    expect(hashTypedData(startRecoveryTypedData(account, newKey, 7n, 1))).not.toBe(base);
  });
});

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

describe("encodeRecoveryAction", () => {
  const inner = (callData: Hex) => {
    const outer = decodeFunctionData({ abi: mezoutAccountV2Abi, data: callData });
    expect(outer.functionName).toBe("execute");
    const [mode, batch] = outer.args as readonly [Hex, Hex];
    expect(mode).toBe(ERC7821_BATCH_MODE);
    const [calls] = decodeAbiParameters(executionsType, batch);
    expect(calls).toHaveLength(1);
    expect(calls[0].target).toBe(account);
    expect(calls[0].value).toBe(0n);
    return decodeFunctionData({ abi: mezoutAccountV2Abi, data: calls[0].callData });
  };

  it("sets a backup passkey as a self-call", () => {
    const call = inner(encodeRecoveryAction(account, { type: "setPasskey", publicKey: newKey, delay: 172_800 }));
    expect(call.functionName).toBe("setRecoveryPasskey");
    expect(call.args).toEqual([`0x${newKey.slice(2, 66)}`, `0x${newKey.slice(66)}`, 172_800n]);
  });

  it("encodes the other actions", () => {
    const wallet: Address = "0x36A95C939Fa70F29421261C770160645Efa9F9E4";
    expect(inner(encodeRecoveryAction(account, { type: "setAddress", address: wallet, delay: 604_800 })).args).toEqual([wallet, 604_800n]);
    expect(inner(encodeRecoveryAction(account, { type: "remove" })).functionName).toBe("removeRecoverySigner");
    expect(inner(encodeRecoveryAction(account, { type: "cancel" })).functionName).toBe("cancelRecovery");
  });
});
