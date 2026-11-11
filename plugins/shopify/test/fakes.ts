/* eslint-disable @typescript-eslint/no-explicit-any -- GraphQL variables in a test fake */
import { normalizeAmount } from "../app/mezout/amount";
import { MezoutClient } from "../app/mezout/client";
import { ShopifyAdmin, type AdminGraphql } from "../app/mezout/shopify-admin";

/**
 * A fake Mezout API behind `fetch`, implementing just enough of docs/API.md: invoices with Idempotency-Key replay,
 * webhook endpoints, refunds, and key checks.
 */
export class FakeMezout {
  validKeys = new Set(["mzk_test_good"]);
  requests: { method: string; path: string; headers: Record<string, string>; body: unknown }[] = [];
  invoices = new Map<string, Record<string, unknown>>();
  idempotency = new Map<string, { status: number; body: unknown }>();
  endpoints: { id: string; url: string; secret: string }[] = [];
  refunds: Record<string, unknown>[] = [];
  /** Statuses to answer the next requests with, before handling normally (e.g. [500] for one failure). */
  failNext: number[] = [];
  private seq = 0;

  fetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const headers = Object.fromEntries(
      Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]),
    );
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    this.requests.push({ method, path: url.pathname + url.search, headers, body });

    const fail = this.failNext.shift();
    if (fail) return json(fail, { error: `fake failure ${fail}` });

    const key = headers.authorization?.replace(/^Bearer /, "") ?? "";
    if (!this.validKeys.has(key)) return json(401, { error: "Missing or invalid API key" });

    const idem = headers["idempotency-key"];
    if (idem && this.idempotency.has(`${key}:${idem}`)) {
      const saved = this.idempotency.get(`${key}:${idem}`)!;
      return json(saved.status, saved.body);
    }
    const res = this.route(method, url, body);
    if (idem && res.status < 500) this.idempotency.set(`${key}:${idem}`, res);
    return json(res.status, res.body);
  };

  private route(method: string, url: URL, body: Record<string, unknown> | undefined): { status: number; body: unknown } {
    const id = () => (++this.seq).toString(16).padStart(24, "0");
    if (method === "GET" && url.pathname === "/v1/invoices") {
      return { status: 200, body: { object: "list", data: [], has_more: false } };
    }
    if (method === "POST" && url.pathname === "/v1/invoices") {
      const inv = {
        id: `inv_${id()}`,
        object: "invoice",
        amount: normalizeAmount(body!.amount),
        currency: "MUSD",
        reference: body!.reference ?? null,
        status: "pending",
        payment: null,
        checkout_url: `https://usemezout.vercel.app/pay/${this.seq}`,
        success_url: body!.success_url ?? null,
        expires_at: new Date(Date.now() + Number(body!.expires_in ?? 86400) * 1000).toISOString(),
      };
      this.invoices.set(inv.id, inv);
      return { status: 201, body: inv };
    }
    if (method === "GET" && url.pathname === "/v1/webhook_endpoints") {
      return { status: 200, body: { object: "list", data: this.endpoints.map(({ id, url }) => ({ id, url })) } };
    }
    if (method === "POST" && url.pathname === "/v1/webhook_endpoints") {
      const target = String(body!.url);
      if (!target.startsWith("https://")) return { status: 400, body: { error: "url must use https" } };
      if (this.endpoints.length >= 3) return { status: 400, body: { error: "an account can have at most 3 endpoints" } };
      const ep = { id: `we_${id()}`, url: target, secret: `whsec_${id()}` };
      this.endpoints.push(ep);
      return { status: 201, body: { ...ep, object: "webhook_endpoint" } };
    }
    const del = /^\/v1\/webhook_endpoints\/(.+)$/.exec(url.pathname);
    if (method === "DELETE" && del) {
      const before = this.endpoints.length;
      this.endpoints = this.endpoints.filter((e) => e.id !== del[1]);
      return before === this.endpoints.length
        ? { status: 404, body: { error: "not found" } }
        : { status: 200, body: { id: del[1], deleted: true } };
    }
    if (method === "POST" && url.pathname === "/v1/refunds") {
      const re = { id: `re_${id()}`, object: "refund", invoice: body!.invoice, amount: body!.amount, status: "pending" };
      this.refunds.push(re);
      return { status: 201, body: re };
    }
    return { status: 404, body: { error: "no route" } };
  }

  client = (apiKey: string) => new MezoutClient({ apiKey, baseUrl: "https://mezout.test", fetch: this.fetch, sleep: async () => {} });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export interface FakeOrder {
  id: string;
  name: string;
  displayFinancialStatus: string;
  cancelledAt: string | null;
  note: string | null;
  outstanding: string;
  currency: string;
  tags: Set<string>;
  metafields: Record<string, string>;
}

/** A fake Shopify Admin GraphQL API for the operations ShopifyAdmin sends. */
export class FakeShopify {
  orders = new Map<string, FakeOrder>();
  shopMetafields: Record<string, string> = {};
  calls: { operation: string; variables: Record<string, unknown> }[] = [];
  currencyCode = "USD";

  addOrder(id: number, outstanding = "25.00", extra: Partial<FakeOrder> = {}): FakeOrder {
    const order: FakeOrder = {
      id: `gid://shopify/Order/${id}`,
      name: `#${1000 + id}`,
      displayFinancialStatus: "PENDING",
      cancelledAt: null,
      note: null,
      outstanding,
      currency: "USD",
      tags: new Set(),
      metafields: {},
      ...extra,
    };
    this.orders.set(order.id, order);
    return order;
  }

  graphql: AdminGraphql = async (query, options) => {
    const operation = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "unknown";
    const v = (options?.variables ?? {}) as Record<string, any>;
    this.calls.push({ operation, variables: v });
    const data = this.handle(operation, v);
    return { json: async () => ({ data }) };
  };

  private handle(op: string, v: Record<string, any>): unknown {
    const ok = { userErrors: [] };
    switch (op) {
      case "MezoutOrder": {
        const o = this.orders.get(v.id);
        return {
          order: o && {
            id: o.id,
            name: o.name,
            displayFinancialStatus: o.displayFinancialStatus,
            cancelledAt: o.cancelledAt,
            note: o.note,
            totalOutstandingSet: { shopMoney: { amount: o.outstanding, currencyCode: o.currency } },
          },
        };
      }
      case "MezoutMarkAsPaid": {
        const o = this.orders.get(v.input.id)!;
        o.displayFinancialStatus = "PAID";
        o.outstanding = "0.0";
        return { orderMarkAsPaid: { order: { id: o.id, displayFinancialStatus: "PAID" }, userErrors: [] } };
      }
      case "MezoutTagsAdd":
        for (const t of v.tags) this.orders.get(v.id)?.tags.add(t);
        return { tagsAdd: ok };
      case "MezoutTagsRemove":
        for (const t of v.tags) this.orders.get(v.id)?.tags.delete(t);
        return { tagsRemove: ok };
      case "MezoutOrderNote":
        return { order: { note: this.orders.get(v.id)?.note ?? null } };
      case "MezoutOrderNoteUpdate": {
        const o = this.orders.get(v.input.id);
        if (o) o.note = v.input.note;
        return { orderUpdate: ok };
      }
      case "MezoutMetafieldsSet":
        for (const m of v.metafields) {
          const target = m.ownerId.startsWith("gid://shopify/Shop/") ? this.shopMetafields : this.orders.get(m.ownerId)?.metafields;
          if (target) target[`${m.namespace}.${m.key}`] = m.value;
        }
        return { metafieldsSet: ok };
      case "MezoutShop":
        return { shop: { id: "gid://shopify/Shop/1", currencyCode: this.currencyCode } };
      default:
        throw new Error(`FakeShopify: unexpected operation ${op}`);
    }
  }

  admin = () => new ShopifyAdmin(this.graphql);

  count(operation: string): number {
    return this.calls.filter((c) => c.operation === operation).length;
  }
}
