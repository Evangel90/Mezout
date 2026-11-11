import { formatUnits, getAddress, keccak256, parseUnits, recoverTypedDataAddress, toHex, type Address, type Hex } from "viem";
import { decodeSignedInvoice, encodeSignedInvoice, linkRouter, mezoTestnetAddresses, paymentTypes, routerDomain } from "@mezout/sdk";
import type { ChainClient } from "./client";

export const MERCHANT: Address = "0x7049Fcb3a331481a1EE860eb041cf0F9A133E264";
export const API_KEY = "mzk_test_fake";
export const APP = "https://mezout.test";

type FakeInvoice = { id: string; token: string; amount: string; reference: string | null; expires_at: string; tx?: Hex; payer?: Address };

/**
 * An in-memory Mezout: /v1/invoices, /v1/verify, /api/relay and /api/sync, enough for the paywall and the payer.
 * The relay checks the payer's Payment signature for real, and records what it was sent (to prove what leaves the agent).
 */
export class FakeMezout {
  invoices = new Map<string, FakeInvoice>();
  relayBodies: unknown[] = [];
  calls: string[] = [];
  router: Address = mezoTestnetAddresses.mezoutRouterV3;
  private n = 0;

  invoiceByOrder(orderId: Hex) {
    return [...this.invoices.values()].find((i) => decodeSignedInvoice(i.token).invoice.orderId === orderId);
  }

  fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const auth = new Headers(init?.headers).get("authorization");
    this.calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
    const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

    if (url.pathname.startsWith("/v1/") && auth !== `Bearer ${API_KEY}`) return json(401, { error: "Missing or invalid API key" });

    if (url.pathname === "/v1/invoices" && init?.method === "POST") {
      const id = `inv_${(++this.n).toString().padStart(24, "0")}`;
      const expiry = Math.floor(Date.now() / 1000) + (body.expires_in ?? 86400);
      const token = encodeSignedInvoice({
        invoice: { merchant: MERCHANT, amount: parseUnits(body.amount, 18), fee: 0n, orderId: keccak256(toHex(id)), expiry: BigInt(expiry) },
        signature: "0x01",
        router: this.router,
      });
      const inv: FakeInvoice = { id, token, amount: body.amount, reference: body.reference ?? null, expires_at: new Date(expiry * 1000).toISOString() };
      this.invoices.set(id, inv);
      return json(201, this.invoiceJson(inv));
    }
    if (url.pathname === "/v1/invoices" && (init?.method ?? "GET") === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? 20);
      const all = [...this.invoices.values()].reverse();
      return json(200, { object: "list", data: all.slice(0, limit).map((i) => this.invoiceJson(i)), has_more: all.length > limit });
    }
    if (url.pathname.startsWith("/v1/invoices/")) {
      const inv = this.invoices.get(decodeURIComponent(url.pathname.slice("/v1/invoices/".length)));
      return inv ? json(200, this.invoiceJson(inv)) : json(404, { error: "No such invoice" });
    }
    if (url.pathname === "/v1/refunds" && init?.method === "POST") {
      const inv = this.invoices.get(body.invoice);
      if (!inv) return json(404, { error: "No such invoice" });
      if (!inv.tx) return json(400, { error: "The invoice is not paid" });
      return json(201, { id: "re_1", object: "refund", invoice: inv.id, amount: body.amount ?? inv.amount, status: "pending" });
    }
    if (url.pathname === "/v1/verify") {
      const inv = this.invoices.get(body.invoice);
      if (!inv) return json(404, { error: "No such invoice" });
      if (!inv.tx) return json(200, { isValid: false, invalidReason: "invoice_not_paid", message: "No payment yet", invoice: this.invoiceJson(inv) });
      if (body.transaction && body.transaction !== inv.tx) {
        return json(200, { isValid: false, invalidReason: "transaction_mismatch", invoice: this.invoiceJson(inv) });
      }
      return json(200, { isValid: true, payer: inv.payer, transaction: inv.tx, invoice: this.invoiceJson(inv) });
    }
    if (url.pathname === "/api/relay") {
      this.relayBodies.push(body);
      const signed = decodeSignedInvoice(body.token);
      const signer = await recoverTypedDataAddress({
        domain: routerDomain(linkRouter(signed)),
        types: paymentTypes,
        primaryType: "Payment",
        message: { invoice: signed.invoice, payer: body.payer },
        signature: body.payerSig,
      });
      if (signer !== getAddress(body.payer)) return json(422, { error: "Your payment signature did not match this invoice." });
      const inv = this.invoiceByOrder(signed.invoice.orderId);
      if (!inv || inv.tx) return json(422, { error: "This invoice has already been paid." });
      inv.tx = keccak256(toHex(`tx:${inv.id}`));
      inv.payer = getAddress(body.payer);
      return json(200, { hash: inv.tx });
    }
    if (url.pathname === "/api/sync") return json(200, { recorded: 1 });
    return json(404, { error: "not found" });
  }) as typeof fetch;

  invoiceJson(inv: FakeInvoice) {
    return {
      id: inv.id,
      object: "invoice",
      amount: inv.amount,
      merchant: MERCHANT,
      reference: inv.reference,
      status: inv.tx ? "paid" : "pending",
      checkout_url: `${APP}/pay/${inv.token}`,
      expires_at: inv.expires_at,
    };
  }

  /** A chain reader agreeing with this fake: the payer holds `balance` MUSD. */
  chain(opts: { balance?: string; chainId?: number } = {}): ChainClient {
    return {
      getChainId: async () => opts.chainId ?? 31611,
      readContract: (async ({ functionName, args }: { functionName: string; args: unknown[] }) => {
        if (functionName === "paid") return !!this.invoiceByOrder(args[0] as Hex)?.tx;
        if (functionName === "balanceOf") return parseUnits(opts.balance ?? "100", 18);
        if (functionName === "nonces") return 0n;
        throw new Error(`unexpected read ${functionName}`);
      }) as unknown as ChainClient["readContract"],
      waitForTransactionReceipt: (async () => ({ status: "success", blockNumber: 123n })) as unknown as ChainClient["waitForTransactionReceipt"],
    };
  }
}

export const fmt = (v: bigint) => formatUnits(v, 18);
