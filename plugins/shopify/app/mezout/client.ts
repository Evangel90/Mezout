/** A small client for the Mezout API (docs/API.md). Mirrors the WooCommerce plugin's Mezout_API. */

export const DEFAULT_MEZOUT_API_BASE = "https://usemezout.vercel.app";

export function mezoutApiBase(env: Record<string, string | undefined> = process.env): string {
  return (env.MEZOUT_API_BASE || DEFAULT_MEZOUT_API_BASE).replace(/\/+$/, "");
}

/** An error answer from Mezout, or a network failure (status 0). */
export class MezoutApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MezoutApiError";
  }
}

export interface MezoutInvoice {
  id: string;
  object: "invoice";
  amount: string;
  currency?: string;
  reference?: string | null;
  status: "pending" | "paid" | "expired" | "refunded";
  checkout_url: string;
  success_url?: string | null;
  expires_at: string;
  amount_refunded?: string;
  payment?: MezoutPayment | null;
}

export interface MezoutPayment {
  id?: string;
  payer?: string;
  method?: string;
  amount?: string;
  net?: string;
  tx_hash?: string;
  paid_at?: string;
}

export interface MezoutRefund {
  id: string;
  object: "refund";
  invoice: string | MezoutInvoice;
  amount: string;
  status: "pending" | "completed" | "canceled";
  tx_hash?: string | null;
}

export interface MezoutWebhookEndpoint {
  id: string;
  url: string;
  secret?: string;
}

export interface CreateInvoiceBody {
  amount: string;
  reference?: string;
  success_url?: string;
  expires_in?: number;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface MezoutClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: FetchLike;
  /** Waits between retries. Tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

export class MezoutClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;

  constructor(opts: MezoutClientOptions) {
    this.apiKey = opts.apiKey.trim();
    this.baseUrl = (opts.baseUrl ?? mezoutApiBase()).replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  /**
   * Sends a request and returns the decoded JSON. A network error, a 5xx or a 409 (the same idempotent request still
   * running) is retried once after a second, with the same Idempotency-Key, so the request still runs only once.
   * Requests that are neither GET nor idempotent are never retried.
   */
  async request<T = Record<string, unknown>>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "User-Agent": "Mezout-Shopify/0.1",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

    const attempts = !idempotencyKey && method !== "GET" ? 1 : 2;
    for (let i = 1; ; i++) {
      try {
        return await this.send<T>(method, path, headers, body);
      } catch (e) {
        const status = e instanceof MezoutApiError ? e.status : 0;
        const retryable = status === 0 || status === 409 || status >= 500;
        if (!retryable || i >= attempts) throw e;
        await this.sleep(1000);
      }
    }
  }

  private async send<T>(method: string, path: string, headers: Record<string, string>, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.baseUrl + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
        // Never let a framework cache API answers.
        cache: "no-store",
      });
    } catch (e) {
      throw new MezoutApiError(`Could not reach Mezout: ${e instanceof Error ? e.message : String(e)}`, 0);
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const message =
        json && typeof json === "object" && typeof (json as { error?: unknown }).error === "string"
          ? (json as { error: string }).error
          : `Mezout answered HTTP ${res.status}`;
      throw new MezoutApiError(message, res.status);
    }
    return (json ?? {}) as T;
  }

  createInvoice(body: CreateInvoiceBody, idempotencyKey: string): Promise<MezoutInvoice> {
    return this.request<MezoutInvoice>("POST", "/v1/invoices", body, idempotencyKey);
  }

  getInvoice(id: string): Promise<MezoutInvoice> {
    return this.request<MezoutInvoice>("GET", `/v1/invoices/${encodeURIComponent(id)}`);
  }

  /** Checks the key with the cheapest authenticated call. Throws MezoutApiError (401 for a bad key). */
  async checkKey(): Promise<void> {
    await this.request("GET", "/v1/invoices?limit=1");
  }

  async listWebhookEndpoints(): Promise<MezoutWebhookEndpoint[]> {
    const res = await this.request<{ data?: MezoutWebhookEndpoint[] }>("GET", "/v1/webhook_endpoints");
    return Array.isArray(res.data) ? res.data : [];
  }

  createWebhookEndpoint(url: string): Promise<MezoutWebhookEndpoint> {
    return this.request<MezoutWebhookEndpoint>("POST", "/v1/webhook_endpoints", { url });
  }

  async deleteWebhookEndpoint(id: string): Promise<void> {
    await this.request("DELETE", `/v1/webhook_endpoints/${encodeURIComponent(id)}`);
  }

  createRefund(
    body: { invoice: string; amount?: string; reason?: string },
    idempotencyKey: string,
  ): Promise<MezoutRefund> {
    return this.request<MezoutRefund>("POST", "/v1/refunds", body, idempotencyKey);
  }
}
