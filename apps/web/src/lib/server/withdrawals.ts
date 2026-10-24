import "server-only";
import { encodeFunctionData, erc20Abi, type Address, type Hex, type PublicClient } from "viem";
import {
  entryPoint07Abi,
  entryPoint07Address,
  getUserOperationHash,
  type UserOperation,
} from "viem/account-abstraction";
import {
  encodeMusdWithdrawal,
  mezoTestnet,
  mezoTestnetAddresses,
  mezoutAccountFactoryAbi,
  splitPublicKey,
} from "@mezout/sdk";
import type { Passkey } from "./passkeys";

// Deployment through initCode costs ~1.6M gas; WebAuthn validation is far cheaper with Mezo's P-256 precompile.
const GAS = {
  verificationDeploy: 2_500_000n,
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

export async function quoteWithdrawal(
  client: PublicClient,
  account: Passkey,
  to: Address,
  amount: bigint,
): Promise<WithdrawalQuote> {
  const sender = account.accountAddress as Address;
  const [balance, nonce, gasPrice, deployed] = await Promise.all([
    client.readContract({ address: mezoTestnetAddresses.musd, abi: erc20Abi, functionName: "balanceOf", args: [sender] }),
    client.readContract({ address: entryPoint07Address, abi: entryPoint07Abi, functionName: "getNonce", args: [sender, 0n] }),
    client.getGasPrice(),
    isDeployed(client, sender),
  ]);
  if (amount <= 0n) throw new WithdrawalError("Amount must be positive");
  if (balance < amount) throw new WithdrawalError("The account does not hold that much MUSD");
  const fee = gasPrice * 2n;
  return { to, amount, nonce, maxFeePerGas: fee > MIN_FEE ? fee : MIN_FEE, deployed };
}

/** Rebuilds the user operation for a quote. `quote.deployed` decides whether initCode deploys the account. */
export function buildWithdrawalOp(account: Passkey, quote: WithdrawalQuote) {
  const { deployed } = quote;
  const { qx, qy } = splitPublicKey(account.publicKey as Hex);
  const userOperation: UserOperation<"0.7"> = {
    sender: account.accountAddress as Address,
    nonce: quote.nonce,
    ...(deployed
      ? {}
      : {
          factory: mezoTestnetAddresses.mezoutAccountFactory,
          factoryData: encodeFunctionData({ abi: mezoutAccountFactoryAbi, functionName: "createAccount", args: [qx, qy] }),
        }),
    callData: encodeMusdWithdrawal(quote.to, quote.amount),
    callGasLimit: GAS.call,
    verificationGasLimit: deployed ? GAS.verification : GAS.verificationDeploy,
    preVerificationGas: GAS.preVerification,
    maxFeePerGas: quote.maxFeePerGas,
    maxPriorityFeePerGas: quote.maxFeePerGas,
    signature: "0x",
  };
  const userOpHash = getUserOperationHash({
    userOperation,
    entryPointAddress: entryPoint07Address,
    entryPointVersion: "0.7",
    chainId: mezoTestnet.id,
  });
  const maxCost = (GAS.call + userOperation.verificationGasLimit + GAS.preVerification) * quote.maxFeePerGas;
  return { userOperation, userOpHash, maxCost };
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
