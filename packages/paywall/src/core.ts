import { getAddress, parseUnits } from "viem";
import {
  decodeSignedInvoice,
  decodeX402Header,
  encodeX402Header,
  linkRouter,
  MEZO_TESTNET_NETWORK,
  MEZOUT_SCHEME,
  mezoTestnetAddresses,
  paymentLinkToken,
  X402_HEADERS,
  X402_VERSION,
  type MezoutPaymentProof,
  type MezoutRequirementExtra,
  type X402PaymentPayload,
  type X402PaymentRequired,
  type X402PaymentRequirements,
  type X402SettlementResponse,
} from "@mezout/sdk";
import { memoryStore, type ConsumedInvoices } from "./store";

export const DEFAULT_API_URL = "https://usemezout.vercel.app";

export type PaywallOptions = {
  /** Merchant API key (`mzk_test_…`). Keep it on the server. */
  apiKey: string;
  /** MUSD per request as a decimal string, e.g. "0.05", or a function of the request. */
  price: string | ((req: PaywallRequest) => string | Promise<string>);
  /** Shown to the agent in `resource.description`. */
  description?: string;
  mimeType?: string;
  /** Mezout base URL. Default https://usemezout.vercel.app. */
  apiUrl?: string;
  /** Seconds the payment request stays payable: 300 to 2,592,000. Default 600. */
  expiresIn?: number;
  /** Where paid invoices are remembered so each unlocks one request. Default: in memory (one process only). */
  store?: ConsumedInvoices;
  fetch?: typeof fetch;
};

/** The parts of an incoming request the paywall reads. */
export type PaywallRequest = { method: string; url: string; header(name: string): string | null | undefined };

/** What the protected handler learns about the payment. */
export type MezoutPayment = { invoice: string; transaction: string; payer: string; amount: string; network: string };

export type PaywallOutcome =
  | { paid: true; payment: MezoutPayment; headers: Record<string, string> }
  | { paid: false; status: number; headers: Record<string, string>; body: unknown };

type ApiInvoice = { id: string; amount: string; merchant: string; reference: string | null; checkout_url: string; expires_at: string };
type Verification = { isValid: boolean; invalidReason?: string; message?: string; payer?: string; transaction?: string; invoice: ApiInvoice };

class MezoutApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const DECIMAL = /^\d+(\.\d{1,18})?$/;

/**
 * The invoice reference that ties an invoice to one resource, so a payment for a cheap route cannot unlock another.
 * The customer sees references at checkout, so it stays readable.
 */
export function resourceReference(method: string, url: string): string {
  return `402 ${method.toUpperCase()} ${new URL(url).pathname}`.slice(0, 200);
}

/** Framework-independent paywall: one call per request decides between "answer 402" and "let it through". */
export function createPaywall(opts: PaywallOptions) {
  const apiUrl = (opts.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, "");
  const doFetch = opts.fetch ?? fetch;
  const store = opts.store ?? memoryStore();
  const expiresIn = opts.expiresIn ?? 600;

  async function api<T>(path: string, init: { method: string; body?: unknown; idempotencyKey?: string }): Promise<T> {
    const res = await doFetch(`${apiUrl}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${opts.apiKey}`,
        "content-type": "application/json",
        ...(init.idempotencyKey && { "idempotency-key": init.idempotencyKey }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new MezoutApiError(res.status, json.error ?? `Mezout answered ${res.status}`);
    return json as T;
  }

  async function priceOf(req: PaywallRequest): Promise<string> {
    const price = typeof opts.price === "function" ? await opts.price(req) : opts.price;
    if (!DECIMAL.test(price) || parseUnits(price, 18) === 0n) throw new Error(`Invalid price "${price}": use a positive decimal string`);
    return price;
  }

  function paymentRequired(req: PaywallRequest, invoice: ApiInvoice, error: string): PaywallOutcome {
    const token = paymentLinkToken(invoice.checkout_url);
    const extra: MezoutRequirementExtra = {
      name: "Mezo USD",
      version: "1",
      invoice: invoice.id,
      checkoutUrl: invoice.checkout_url,
      router: getAddress(linkRouter(decodeSignedInvoice(token))),
      relayUrl: `${new URL(invoice.checkout_url).origin}/api/relay`,
      expiresAt: invoice.expires_at,
    };
    const requirements: X402PaymentRequirements = {
      scheme: MEZOUT_SCHEME,
      network: MEZO_TESTNET_NETWORK,
      amount: parseUnits(invoice.amount, 18).toString(),
      asset: mezoTestnetAddresses.musd,
      payTo: invoice.merchant,
      maxTimeoutSeconds: Math.max(0, Math.floor((Date.parse(invoice.expires_at) - Date.now()) / 1000)),
      extra,
    };
    const body: X402PaymentRequired = {
      x402Version: X402_VERSION,
      error,
      resource: { url: req.url, ...(opts.description && { description: opts.description }), ...(opts.mimeType && { mimeType: opts.mimeType }) },
      accepts: [requirements],
    };
    return { paid: false, status: 402, headers: { [X402_HEADERS.paymentRequired]: encodeX402Header(body) }, body };
  }

  async function newPaymentRequest(req: PaywallRequest, price: string, error: string): Promise<PaywallOutcome> {
    // A client that retries an unpaid request with the same Idempotency-Key gets the same invoice back.
    const clientKey = req.header("idempotency-key");
    const invoice = await api<ApiInvoice>("/v1/invoices", {
      method: "POST",
      body: { amount: price, reference: resourceReference(req.method, req.url), expires_in: expiresIn },
      idempotencyKey: clientKey ? `402:${resourceReference(req.method, req.url)}:${clientKey}`.slice(0, 255) : undefined,
    });
    return paymentRequired(req, invoice, error);
  }

  function failure(status: number, error: string): PaywallOutcome {
    return { paid: false, status, headers: {}, body: { error } };
  }

  async function handle(req: PaywallRequest): Promise<PaywallOutcome> {
    try {
      const price = await priceOf(req);
      const header = req.header(X402_HEADERS.paymentSignature) ?? req.header("x-payment");
      if (!header) return await newPaymentRequest(req, price, "Payment required");

      let payload: X402PaymentPayload<Partial<MezoutPaymentProof>>;
      try {
        payload = decodeX402Header(header);
      } catch {
        return failure(400, `${X402_HEADERS.paymentSignature} is not base64 JSON`);
      }
      const proof = payload?.payload;
      if (payload?.accepted?.scheme !== MEZOUT_SCHEME || typeof proof?.invoice !== "string" || typeof proof.transaction !== "string") {
        return failure(400, `Expected a "${MEZOUT_SCHEME}" payment with payload.invoice and payload.transaction`);
      }

      let v: Verification;
      try {
        v = await api<Verification>("/v1/verify", { method: "POST", body: { invoice: proof.invoice, transaction: proof.transaction } });
      } catch (err) {
        if (err instanceof MezoutApiError && (err.status === 404 || err.status === 400)) {
          return await newPaymentRequest(req, price, "Unknown invoice");
        }
        throw err;
      }
      if (!v.isValid) {
        // Not paid yet (or expired, refunded, wrong transaction): offer the same invoice while it can still be paid.
        if (v.invalidReason === "invoice_not_paid") return paymentRequired(req, v.invoice, v.message ?? "Invoice not paid");
        return await newPaymentRequest(req, price, v.message ?? v.invalidReason ?? "Payment not valid");
      }
      if (v.invoice.reference !== resourceReference(req.method, req.url) || parseUnits(v.invoice.amount, 18) !== parseUnits(price, 18)) {
        return await newPaymentRequest(req, price, "That invoice was for a different resource or price");
      }
      if (!(await store.consume(v.invoice.id))) {
        return await newPaymentRequest(req, price, "That invoice has already been used");
      }
      const payment: MezoutPayment = {
        invoice: v.invoice.id,
        transaction: v.transaction ?? proof.transaction,
        payer: v.payer ?? "",
        amount: v.invoice.amount,
        network: MEZO_TESTNET_NETWORK,
      };
      const settlement: X402SettlementResponse = {
        success: true,
        transaction: payment.transaction,
        network: payment.network,
        payer: payment.payer,
      };
      return { paid: true, payment, headers: { [X402_HEADERS.paymentResponse]: encodeX402Header(settlement) } };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment check failed";
      return failure(err instanceof MezoutApiError ? 502 : 500, `Mezout paywall: ${message}`);
    }
  }

  return { handle };
}

export type Paywall = ReturnType<typeof createPaywall>;
