import { describe, expect, it } from "vitest";
import { P256 } from "ox";
import {
  concat,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  keccak256,
  sha256,
  stringToBytes,
  toHex,
  type Address,
  type Hex,
} from "viem";
import {
  decodeMusdWithdrawal,
  decodeWebAuthnSignature,
  encodeMusdWithdrawal,
  encodeWebAuthnSignature,
  ERC7821_BATCH_MODE,
  normalizePublicKey,
  splitPublicKey,
} from "./account";
import { mezoutAccountAbi } from "./abi/mezoutAccount";
import { mezoTestnetAddresses } from "./addresses";

const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const to: Address = "0x36A95C939Fa70F29421261C770160645Efa9F9E4";
const musd = mezoTestnetAddresses.musd;

// Pinned in contracts/test/unit/MezoutAccountVectors.t.sol, which checks MezoutAccount accepts these exact bytes.
// Key 0xA11CE, challenge keccak256("mezout passkey vector"), same assertion shape as contracts/test/utils/Passkey.sol.
const PINNED_SIGNATURE: Hex =
  "0xea18074511530ed5f6f42845d24ad3f6e0183084e84ec587cff3c99a506b00b50902f2281c8dbcd100667a7220281d55d13e5fa28d646eb61d62837b1c154f390000000000000000000000000000000000000000000000000000000000000017000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000025939566e798b035b91020cb85751e6e94ac9893fb2b92c929877349b3ccc185fa050000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000847b2274797065223a22776562617574686e2e676574222c226368616c6c656e6765223a22736d30705a5442544135674f634a786565567866776d77796a37463267694631564b7932344735506f3145222c226f726967696e223a2268747470733a2f2f6d657a6f75742e74657374222c2263726f73734f726967696e223a66616c73657d00000000000000000000000000000000000000000000000000000000";

function vectorAssertion() {
  const challenge = Buffer.from(keccak256(stringToBytes("mezout passkey vector")).slice(2), "hex").toString("base64url");
  const clientDataJSON = `{"type":"webauthn.get","challenge":"${challenge}","origin":"https://mezout.test","crossOrigin":false}`;
  const authenticatorData = concat([sha256(stringToBytes("mezout.test")), "0x05", "0x00000000"]);
  const digest = sha256(concat([authenticatorData, sha256(stringToBytes(clientDataJSON))]));
  const sig = P256.sign({ payload: digest, privateKey: toHex(0xa11cen, { size: 32 }), hash: false });
  const s = sig.s > N / 2n ? N - sig.s : sig.s;
  return { r: sig.r, s, authenticatorData, clientDataJSON, challengeIndex: 23, typeIndex: 1 };
}

function execute(calls: { target: Address; value: bigint; callData: Hex }[]): Hex {
  const batch = encodeAbiParameters(
    [
      {
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    [calls],
  );
  return encodeFunctionData({ abi: mezoutAccountAbi, functionName: "execute", args: [ERC7821_BATCH_MODE, batch] });
}

describe("passkey account helpers", () => {
  it("splits public keys with and without the 0x04 prefix", () => {
    const x = "11".repeat(32);
    const y = "22".repeat(32);
    expect(splitPublicKey(`0x04${x}${y}`)).toEqual({ qx: `0x${x}`, qy: `0x${y}` });
    expect(splitPublicKey(`0x${x}${y}`)).toEqual({ qx: `0x${x}`, qy: `0x${y}` });
    expect(normalizePublicKey(`0x04${"AB".repeat(32)}${y}`)).toBe(`0x${"ab".repeat(32)}${y}`);
    expect(() => splitPublicKey("0x1234")).toThrow();
  });

  it("round-trips a MUSD withdrawal", () => {
    const amount = 25n * 10n ** 18n;
    expect(decodeMusdWithdrawal(encodeMusdWithdrawal(to, amount))).toEqual({ to, amount });
  });

  it("accepts only a single, zero-value MUSD transfer", () => {
    const transfer = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, 1n] });
    const approve = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [to, 1n] });
    expect(decodeMusdWithdrawal(execute([{ target: musd, value: 0n, callData: transfer }]))).toEqual({ to, amount: 1n });
    expect(decodeMusdWithdrawal(execute([{ target: musd, value: 0n, callData: approve }]))).toBeNull();
    expect(decodeMusdWithdrawal(execute([{ target: to, value: 0n, callData: transfer }]))).toBeNull();
    expect(decodeMusdWithdrawal(execute([{ target: musd, value: 1n, callData: transfer }]))).toBeNull();
    const twice = { target: musd, value: 0n, callData: transfer };
    expect(decodeMusdWithdrawal(execute([twice, twice]))).toBeNull();
    expect(decodeMusdWithdrawal(`${encodeMusdWithdrawal(to, 1n)}00`)).toBeNull();
    expect(decodeMusdWithdrawal("0x1234")).toBeNull();
  });

  it("encodes WebAuthn signatures in the layout MezoutAccount decodes", () => {
    const assertion = vectorAssertion();
    const encoded = encodeWebAuthnSignature(assertion);
    expect(decodeWebAuthnSignature(encoded)).toEqual(assertion);
    expect(encoded).toBe(PINNED_SIGNATURE);
  });
});
