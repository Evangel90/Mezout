/** Minimal client for Mezout's public /v1 API, authenticated with a merchant API key. */
export class MezoutApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class MezoutApi {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly doFetch: typeof fetch = fetch,
  ) {}

  private async request<T>(method: string, path: string, opts: { body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
    const res = await this.doFetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        ...(opts.body !== undefined && { "content-type": "application/json" }),
        ...(opts.idempotencyKey && { "idempotency-key": opts.idempotencyKey }),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      const retry = res.headers.get("retry-after");
      throw new MezoutApiError(res.status, `${json.error ?? `Mezout answered ${res.status}`}${retry ? ` (retry after ${retry}s)` : ""}`);
    }
    return json as T;
  }

  createInvoice(body: { amount: string; reference?: string; success_url?: string; expires_in?: number }, idempotencyKey: string) {
    return this.request<Record<string, unknown>>("POST", "/v1/invoices", { body, idempotencyKey });
  }

  getInvoice(id: string) {
    return this.request<Record<string, unknown>>("GET", `/v1/invoices/${encodeURIComponent(id)}`);
  }

  listInvoices(params: { limit?: number; starting_after?: string }) {
    const q = new URLSearchParams();
    if (params.limit !== undefined) q.set("limit", String(params.limit));
    if (params.starting_after) q.set("starting_after", params.starting_after);
    const qs = q.toString();
    return this.request<Record<string, unknown>>("GET", `/v1/invoices${qs ? `?${qs}` : ""}`);
  }

  createRefund(body: { invoice: string; amount?: string; reason?: string }, idempotencyKey: string) {
    return this.request<Record<string, unknown>>("POST", "/v1/refunds", { body, idempotencyKey });
  }

  verify(body: { invoice: string; transaction?: string }) {
    return this.request<Record<string, unknown>>("POST", "/v1/verify", { body });
  }
}
