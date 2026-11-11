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
  mezoutRouterAbi,
  musdAbi,
  paymentLinkToken,
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

  async function pay(checkoutUrlOrToken: string, expect: { amount?: bigint; merchant?: string } = {}): Promise<PaidInvoice> {
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
      const payer = opts.account.address;
      const [paid, balance, nonce] = await Promise.all([
        chain.readContract({ address: router, abi: mezoutRouterAbi, functionName: "paid", args: [invoice.orderId] }),
        chain.readContract({ address: mezoTestnetAddresses.musd, abi: musdAbi, functionName: "balanceOf", args: [payer] }),
        chain.readContract({ address: mezoTestnetAddresses.musd, abi: musdAbi, functionName: "nonces", args: [payer] }),
      ]);
      if (paid) throw new PaymentRefused("This invoice has already been paid.");
      if (balance < invoice.amount) {
        throw new PaymentRefused(`The payer holds ${formatUnits(balance, 18)} MUSD; the invoice needs ${formatUnits(invoice.amount, 18)}.`);
      }

      const body = await signMusdPayment({
        token,
        signer: opts.account,
        musdNonce: nonce,
        permitDeadline: BigInt(Math.floor(now() / 1000) + 600),
      });
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
    address: opts.account.address,
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
