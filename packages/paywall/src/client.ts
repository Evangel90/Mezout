import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  isAddressEqual,
  parseUnits,
  type Address,
  type Hex,
  type LocalAccount,
  type PublicClient,
} from "viem";
import {
  decodeSignedInvoice,
  decodeX402Header,
  encodeX402Header,
  knownMezoutRouters,
  linkRouter,
  MEZO_TESTNET_NETWORK,
  mezoTestnet,
  MEZOUT_SCHEME,
  mezoTestnetAddresses,
  mezoutAgentWalletAbi,
  mezoutRouterAbi,
  musdAbi,
  paymentLinkToken,
  signAgentWalletPayment,
  signMusdPayment,
  X402_HEADERS,
  X402_VERSION,
  type MezoutPaymentProof,
  type MezoutRequirementExtra,
  type X402PaymentPayload,
  type X402PaymentRequired,
  type X402PaymentRequirements,
  type X402SettlementResponse,
} from "@mezout/sdk";

export type ChainClient = Pick<PublicClient, "getChainId" | "readContract" | "waitForTransactionReceipt">;

export type PayerOptions = {
  /** The payer's key, as a viem account. It signs locally; only the two signatures go to Mezout's relay. */
  account: LocalAccount;
  /** Mezout base URL whose `/api/relay` submits the payment. The relay named in a 402 answer is never used. */
  appUrl: string;
  /** Largest single payment, in MUSD (decimal string). */
  maxPerPayment: string;
  /** Total this payer may spend while the process runs, in MUSD (decimal string). */
  maxPerSession: string;
  /**
   * Pay from this `MezoutAgentWallet` instead of from `account`'s own MUSD. `account` is then a session key the
   * wallet's owner approved, and the wallet enforces the owner's limits on-chain (the caps above still apply too).
   */
  agentWallet?: Address;
  rpcUrl?: string;
  chain?: ChainClient;
  fetch?: typeof fetch;
  now?: () => number;
};

export type PaidInvoice = {
  transaction: Hex;
  payer: Address;
  amount: string;
  merchant: Address;
  orderId: Hex;
  router: Address;
  blockNumber: string;
  explorerUrl: string;
};

export class PaymentRefused extends Error {}

/**
 * Pays Mezout payment links in MUSD as `account`, gaslessly through Mezout's relay, exactly as the checkout does:
 * one EIP-712 `Payment` and one MUSD permit for the exact amount to the link's router. Testnet only, known Mezout
 * routers only, and capped per payment and per session. Never returns or logs signatures or keys.
 */
export function createMusdPayer(opts: PayerOptions) {
  const appUrl = opts.appUrl.replace(/\/+$/, "");
  const chain = opts.chain ?? createPublicClient({ chain: mezoTestnet, transport: http(opts.rpcUrl ?? mezoTestnet.rpcUrls.default.http[0]) });
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const maxPerPayment = parseUnits(opts.maxPerPayment, 18);
  const maxPerSession = parseUnits(opts.maxPerSession, 18);
  let spent = 0n;
  let reserved = 0n;
  const agentWallet = opts.agentWallet ? getAddress(opts.agentWallet) : undefined;

  /**
   * Reads the wallet's on-chain session for this key and refuses, before signing, anything the wallet would revert:
   * so the agent gets a clear reason and the relay is not asked to simulate a payment that cannot settle.
   */
  async function checkAgentWallet(wallet: Address, router: Address, merchant: Address, amount: bigint) {
    const agent = opts.account.address;
    const read = <T>(functionName: string, args: unknown[] = []) =>
      chain.readContract({ address: wallet, abi: mezoutAgentWalletAbi, functionName, args } as never) as Promise<T>;
    const [walletRouter, session, remaining, merchantOk] = await Promise.all([
      read<Address>("router"),
      read<readonly [bigint, bigint, bigint, bigint, boolean]>("sessions", [agent]),
      read<bigint>("remainingToday", [agent]),
      read<boolean>("canPayMerchant", [agent, merchant]),
    ]);
    if (!isAddressEqual(walletRouter, router)) {
      throw new PaymentRefused("The link was made for a different Mezout router than the agent wallet pays through.");
    }
    const [maxPerPayment, , validUntil] = session;
    if (validUntil === 0n) throw new PaymentRefused("This session key is not approved on the agent wallet (or was revoked).");
    if (validUntil * 1000n < BigInt(now())) throw new PaymentRefused("This session key's approval on the agent wallet has expired.");
    if (!merchantOk) throw new PaymentRefused("The agent wallet's owner has not allowed this merchant.");
    if (amount > maxPerPayment) {
      throw new PaymentRefused(`${formatUnits(amount, 18)} MUSD is over the agent wallet's per-payment limit of ${formatUnits(maxPerPayment, 18)} MUSD.`);
    }
    if (amount > remaining) {
      throw new PaymentRefused(`${formatUnits(amount, 18)} MUSD is over what the agent wallet allows today (${formatUnits(remaining, 18)} MUSD left).`);
    }
  }

  /**
   * Pays one link. `expect.amount` and `expect.merchant` must match the link exactly (a 402 requirement's terms);
   * `expect.maxAmount` (decimal MUSD) is an extra ceiling for this call.
   */
  async function pay(
    checkoutUrlOrToken: string,
    expect: { amount?: bigint; merchant?: string; maxAmount?: string } = {},
  ): Promise<PaidInvoice> {
    const token = paymentLinkToken(checkoutUrlOrToken);
    let signed;
    try {
      signed = decodeSignedInvoice(token);
    } catch {
      throw new PaymentRefused("Not a Mezout payment link.");
    }
    const { invoice } = signed;
    const router = getAddress(linkRouter(signed));
    if (!knownMezoutRouters.some((r) => isAddressEqual(r, router))) throw new PaymentRefused("The link names an unknown router.");
    if (expect.amount !== undefined && invoice.amount !== expect.amount) throw new PaymentRefused("The link's amount differs from the request.");
    if (expect.merchant !== undefined && !isAddressEqual(invoice.merchant, getAddress(expect.merchant))) {
      throw new PaymentRefused("The link pays a different merchant than the request names.");
    }
    if (expect.maxAmount !== undefined && invoice.amount > parseUnits(expect.maxAmount, 18)) {
      throw new PaymentRefused(`The invoice asks ${formatUnits(invoice.amount, 18)} MUSD, more than the ${expect.maxAmount} MUSD allowed for this call.`);
    }
    if (Number(invoice.expiry) * 1000 < now() + 30_000) throw new PaymentRefused("The payment link has expired.");
    if (invoice.amount > maxPerPayment) {
      throw new PaymentRefused(`${formatUnits(invoice.amount, 18)} MUSD is over the per-payment limit of ${opts.maxPerPayment} MUSD.`);
    }
    if (spent + reserved + invoice.amount > maxPerSession) {
      throw new PaymentRefused(
        `Paying ${formatUnits(invoice.amount, 18)} MUSD would pass the session limit of ${opts.maxPerSession} MUSD ` +
          `(${formatUnits(spent, 18)} spent).`,
      );
    }

    reserved += invoice.amount;
    try {
      const chainId = await chain.getChainId();
      if (chainId !== mezoTestnet.id) throw new PaymentRefused(`The RPC is chain ${chainId}; Mezout agents pay on Mezo testnet (31611) only.`);
      const payer = agentWallet ?? opts.account.address;
      const [paid, balance] = await Promise.all([
        chain.readContract({ address: router, abi: mezoutRouterAbi, functionName: "paid", args: [invoice.orderId] }),
        chain.readContract({ address: mezoTestnetAddresses.musd, abi: musdAbi, functionName: "balanceOf", args: [payer] }),
      ]);
      if (paid) throw new PaymentRefused("This invoice has already been paid.");
      if (balance < invoice.amount) {
        throw new PaymentRefused(`The payer holds ${formatUnits(balance, 18)} MUSD; the invoice needs ${formatUnits(invoice.amount, 18)}.`);
      }

      let body: unknown;
      if (agentWallet) {
        await checkAgentWallet(agentWallet, router, invoice.merchant, invoice.amount);
        body = await signAgentWalletPayment({ token, wallet: agentWallet, signer: opts.account });
      } else {
        const nonce = await chain.readContract({ address: mezoTestnetAddresses.musd, abi: musdAbi, functionName: "nonces", args: [payer] });
        body = await signMusdPayment({
          token,
          signer: opts.account,
          musdNonce: nonce,
          permitDeadline: BigInt(Math.floor(now() / 1000) + 600),
        });
      }
      const res = await doFetch(`${appUrl}/api/relay`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { hash?: Hex; error?: string };
      if (!res.ok || !json.hash) throw new Error(json.error ?? `The relay answered ${res.status}`);
      spent += invoice.amount;

      const receipt = await chain.waitForTransactionReceipt({ hash: json.hash });
      if (receipt.status !== "success") throw new Error(`The payment transaction ${json.hash} reverted.`);
      // Ask Mezout to index it now so the merchant's webhook and /v1/verify see it at once. Best effort.
      await doFetch(`${appUrl}/api/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ block: receipt.blockNumber.toString() }),
      }).catch(() => null);
      return {
        transaction: json.hash,
        payer,
        amount: formatUnits(invoice.amount, 18),
        merchant: invoice.merchant,
        orderId: invoice.orderId,
        router,
        blockNumber: receipt.blockNumber.toString(),
        explorerUrl: `${mezoTestnet.blockExplorers.default.url}/tx/${json.hash}`,
      };
    } finally {
      reserved -= invoice.amount;
    }
  }

  return {
    pay,
    /** The address that pays: the agent wallet when one is set, else the key's own address. */
    address: agentWallet ?? opts.account.address,
    /** The session key, when paying from an agent wallet. */
    sessionKey: agentWallet ? opts.account.address : undefined,
    /** Spending so far and what is left under the session cap, in MUSD. */
    budget: () => ({
      spent: formatUnits(spent, 18),
      remaining: formatUnits(maxPerSession - spent - reserved, 18),
      maxPerPayment: opts.maxPerPayment,
      maxPerSession: opts.maxPerSession,
    }),
  };
}

export type MusdPayer = ReturnType<typeof createMusdPayer>;

export type PaidFetchResult = {
  response: Response;
  /** Present when a 402 was paid on the way. */
  payment?: PaidInvoice & { invoice: string; settlement?: X402SettlementResponse };
};

/** Picks the Mezout requirement from a 402 answer, or explains why there is none. */
export function selectMezoutRequirement(required: X402PaymentRequired): X402PaymentRequirements<MezoutRequirementExtra> {
  const match = required.accepts?.find(
    (a) => a.scheme === MEZOUT_SCHEME && a.network === MEZO_TESTNET_NETWORK && isAddressEqual(a.asset as Address, mezoTestnetAddresses.musd),
  );
  if (!match) {
    const offered = (required.accepts ?? []).map((a) => `${a.scheme}@${a.network}`).join(", ") || "nothing";
    throw new PaymentRefused(`The server offers ${offered}; this client pays only "${MEZOUT_SCHEME}" on ${MEZO_TESTNET_NETWORK}.`);
  }
  const extra = match.extra as Partial<MezoutRequirementExtra> | undefined;
  if (!extra?.checkoutUrl || !extra.invoice) throw new PaymentRefused("The payment request has no Mezout invoice.");
  return match as X402PaymentRequirements<MezoutRequirementExtra>;
}

async function readPaymentRequired(res: Response): Promise<X402PaymentRequired> {
  const header = res.headers.get(X402_HEADERS.paymentRequired);
  if (header) return decodeX402Header<X402PaymentRequired>(header);
  return (await res.json()) as X402PaymentRequired;
}

/**
 * `fetch` that completes an x402 `mezout` payment: on 402 it pays the offered invoice with `payer` (within its caps)
 * and retries once with the proof in `PAYMENT-SIGNATURE`. Request bodies must be replayable (strings, not streams).
 */
export async function fetchWithPayment(
  input: string | URL,
  init: RequestInit & { payer: MusdPayer; fetch?: typeof fetch },
): Promise<PaidFetchResult> {
  const { payer, fetch: f = fetch, ...requestInit } = init;
  const first = await f(input, requestInit);
  if (first.status !== 402) return { response: first };

  const required = await readPaymentRequired(first);
  const requirement = selectMezoutRequirement(required);
  const paid = await payer.pay(requirement.extra!.checkoutUrl, { amount: BigInt(requirement.amount), merchant: requirement.payTo });

  const proof: X402PaymentPayload<MezoutPaymentProof> = {
    x402Version: X402_VERSION,
    resource: required.resource,
    accepted: requirement,
    payload: { invoice: requirement.extra!.invoice, transaction: paid.transaction, payer: paid.payer },
  };
  const headers = new Headers(requestInit.headers);
  headers.set(X402_HEADERS.paymentSignature, encodeX402Header(proof));
  const response = await f(input, { ...requestInit, headers });
  const settlementHeader = response.headers.get(X402_HEADERS.paymentResponse);
  let settlement: X402SettlementResponse | undefined;
  try {
    settlement = settlementHeader ? decodeX402Header<X402SettlementResponse>(settlementHeader) : undefined;
  } catch {
    settlement = undefined;
  }
  return { response, payment: { ...paid, invoice: requirement.extra!.invoice, settlement } };
}
