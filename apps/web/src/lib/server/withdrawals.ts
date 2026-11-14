import "server-only";
import { encodeFunctionData, erc20Abi, isAddressEqual, type Address, type Hex, type PublicClient } from "viem";
import {
  entryPoint07Abi,
  entryPoint07Address,
  getUserOperationHash,
  toPackedUserOperation,
  type UserOperation,
} from "viem/account-abstraction";
import {
  encodeMusdWithdrawal,
  mezoutAccountFactoryAbi,
  mezoutAccountFactoryV2Abi,
  requireAddress,
  splitPublicKey,
} from "@mezout/sdk";
import type { relayerClient } from "./clients";
import { serverNetwork } from "./network";
import type { Passkey } from "./passkeys";
import { sendAsRelayer } from "./relayerQueue";

// Deployment through initCode costs ~1.6M gas for v1 and ~2.7M for v2 (recovery makes the account bigger); WebAuthn
// validation is far cheaper with Mezo's P-256 precompile.
const GAS = {
  verificationDeploy: 2_500_000n,
  verificationDeployV2: 3_500_000n,
  verification: 600_000n,
  call: 200_000n,
  preVerification: 100_000n,
} as const;
const MIN_FEE = 1_000n;

export class WithdrawalError extends Error {}

/**
 * The few values the client echoes back; everything else is rebuilt by the server. Chain reads (nonce, deployed) are
 * pinned in the quote because RPC nodes can lag: re-reading them at submit time could rebuild a different operation
 * than the one the passkey signed. A wrong echoed value only makes the EntryPoint reject the operation in simulation.
 */
export type WithdrawalQuote = { to: Address; amount: bigint; nonce: bigint; maxFeePerGas: bigint; deployed: boolean };
/** The chain-dependent part of any user operation quote. */
export type OpQuote = { nonce: bigint; maxFeePerGas: bigint; deployed: boolean };

/** The network's v1 passkey account factory. */
export const accountFactoryV1 = (): Address => requireAddress(serverNetwork(), "mezoutAccountFactory");
/** The network's MezoutAccountFactoryV2 (accounts with recovery), or undefined while it is not deployed there. */
export const accountFactoryV2 = (): Address | undefined => serverNetwork().addresses.mezoutAccountFactoryV2;

/** Which factory deploys an account that is not deployed yet: v2 if the v2 factory predicts its address, else v1. */
export async function accountFactory(client: PublicClient, account: Passkey): Promise<Address> {
  const mezoutAccountFactoryV2 = accountFactoryV2();
  if (!mezoutAccountFactoryV2) return accountFactoryV1();
  const { qx, qy } = splitPublicKey(account.publicKey as Hex);
  const predicted = await client.readContract({
    address: mezoutAccountFactoryV2,
    abi: mezoutAccountFactoryV2Abi,
    functionName: "getAddress",
    args: [qx, qy],
  });
  return isAddressEqual(predicted, account.accountAddress as Address) ? mezoutAccountFactoryV2 : accountFactoryV1();
}

/** Nonce, fee and deployment state for a new user operation from `account`. */
export async function quoteOp(client: PublicClient, account: Passkey): Promise<OpQuote> {
  const sender = account.accountAddress as Address;
  const [nonce, gasPrice, deployed] = await Promise.all([
    client.readContract({ address: entryPoint07Address, abi: entryPoint07Abi, functionName: "getNonce", args: [sender, 0n] }),
    client.getGasPrice(),
    isDeployed(client, sender),
  ]);
  const fee = gasPrice * 2n;
  return { nonce, maxFeePerGas: fee > MIN_FEE ? fee : MIN_FEE, deployed };
}

export async function quoteWithdrawal(
  client: PublicClient,
  account: Passkey,
  to: Address,
  amount: bigint,
): Promise<WithdrawalQuote> {
  const [balance, op] = await Promise.all([
    client.readContract({ address: requireAddress(serverNetwork(), "musd"), abi: erc20Abi, functionName: "balanceOf", args: [account.accountAddress as Address] }),
    quoteOp(client, account),
  ]);
  if (amount <= 0n) throw new WithdrawalError("Amount must be positive");
  if (balance < amount) throw new WithdrawalError("The account does not hold that much MUSD");
  return { to, amount, ...op };
}

/**
 * Rebuilds a user operation that runs `callData` on the account. `quote.deployed` decides whether initCode deploys the
 * account, through `factory` (the v1 factory unless the account is a v2 one).
 */
export function buildAccountOp(account: Passkey, quote: OpQuote, callData: Hex, factory: Address = accountFactoryV1()) {
  const { deployed } = quote;
  const { qx, qy } = splitPublicKey(account.publicKey as Hex);
  const v2Factory = accountFactoryV2();
  const v2 = !!v2Factory && isAddressEqual(factory, v2Factory);
  const verificationGasLimit = deployed ? GAS.verification : v2 ? GAS.verificationDeployV2 : GAS.verificationDeploy;
  const userOperation: UserOperation<"0.7"> = {
    sender: account.accountAddress as Address,
    nonce: quote.nonce,
    ...(deployed
      ? {}
      : {
          factory,
          factoryData: encodeFunctionData({ abi: mezoutAccountFactoryAbi, functionName: "createAccount", args: [qx, qy] }),
        }),
    callData,
    callGasLimit: GAS.call,
    verificationGasLimit,
    preVerificationGas: GAS.preVerification,
    maxFeePerGas: quote.maxFeePerGas,
    maxPriorityFeePerGas: quote.maxFeePerGas,
    signature: "0x",
  };
  const userOpHash = getUserOperationHash({
    userOperation,
    entryPointAddress: entryPoint07Address,
    entryPointVersion: "0.7",
    chainId: serverNetwork().chainId,
  });
  const maxCost = (GAS.call + verificationGasLimit + GAS.preVerification) * quote.maxFeePerGas;
  return { userOperation, userOpHash, maxCost };
}

/** Rebuilds the withdrawal user operation for a quote. */
export function buildWithdrawalOp(account: Passkey, quote: WithdrawalQuote, factory?: Address) {
  return buildAccountOp(account, quote, encodeMusdWithdrawal(quote.to, quote.amount, serverNetwork().network), factory);
}

export async function isDeployed(client: PublicClient, address: Address): Promise<boolean> {
  const code = await client.getCode({ address });
  return !!code && code !== "0x";
}

/** Rejects fees far above the current gas price, so a client cannot make the relayer over-fund a deposit. */
export async function checkFee(client: PublicClient, maxFeePerGas: bigint): Promise<void> {
  const gasPrice = await client.getGasPrice();
  const cap = gasPrice * 10n > MIN_FEE * 10n ? gasPrice * 10n : MIN_FEE * 10n;
  if (maxFeePerGas > cap) throw new WithdrawalError("Fee too high; request a new quote");
}

/**
 * Sponsors gas for a signed user operation and sends it through EntryPoint v0.7: tops up the account's EntryPoint
 * deposit (the EntryPoint refunds the relayer from it), simulates handleOps, then sends it. Returns the tx hash.
 */
export async function sponsorAndSend(
  client: PublicClient,
  wallet: ReturnType<typeof relayerClient>,
  built: ReturnType<typeof buildAccountOp>,
  signature: Hex,
): Promise<Hex> {
  const { userOperation, maxCost } = built;
  const sender = userOperation.sender;
  const deposit = await client.readContract({ address: entryPoint07Address, abi: entryPoint07Abi, functionName: "balanceOf", args: [sender] });
  if (deposit < maxCost) {
    const topUp = await sendAsRelayer((nonce) =>
      wallet.writeContract({
        address: entryPoint07Address,
        abi: entryPoint07Abi,
        functionName: "depositTo",
        args: [sender],
        value: maxCost - deposit,
        nonce,
      }),
    );
    await client.waitForTransactionReceipt({ hash: topUp });
  }

  const call = {
    account: wallet.account,
    address: entryPoint07Address,
    abi: entryPoint07Abi,
    functionName: "handleOps",
    args: [[toPackedUserOperation({ ...userOperation, signature })], wallet.account.address],
  } as const;
  const estimate = await client.estimateContractGas(call).catch(() => 0n);
  const floor = userOperation.verificationGasLimit + userOperation.callGasLimit + 300_000n;
  const { request } = await client.simulateContract({ ...call, gas: (estimate * 13n) / 10n > floor ? (estimate * 13n) / 10n : floor });
  return sendAsRelayer((nonce) => wallet.writeContract({ ...request, nonce }));
}
