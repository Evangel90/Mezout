import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { createMusdPayer, fetchWithPayment, type ChainClient, type MusdPayer } from "@mezout/paywall/client";
import { MezoutApi } from "./api";
import type { Config } from "./config";

export const SERVER_NAME = "mezout";
export const SERVER_VERSION = "0.2.0";

const MAX_BODY_CHARS = 50_000;

const ok = (value: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const fail = (message: string): CallToolResult => ({ content: [{ type: "text", text: message }], isError: true });

/** Runs a tool body, turning any error into a tool error (its message only: never stacks or request bodies). */
async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    return fail(err instanceof Error ? err.message : "The call failed");
  }
}

const amount = z.string().regex(/^\d+(\.\d{1,18})?$/, 'a decimal MUSD amount such as "25.00"');

/**
 * Builds the Mezout MCP server. Merchant tools need `config.apiKey`; payer tools need `config.payerKey`. `fetch` and
 * `chain` are injectable for tests.
 */
export function createMezoutServer(config: Config, deps: { fetch?: typeof fetch; chain?: ChainClient } = {}) {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const doFetch = deps.fetch ?? fetch;
  const api = config.apiKey ? new MezoutApi(config.apiUrl, config.apiKey, doFetch) : null;
  const payer: MusdPayer | null = config.payerKey
    ? createMusdPayer({
        account: privateKeyToAccount(config.payerKey),
        appUrl: config.apiUrl,
        rpcUrl: config.rpcUrl,
        maxPerPayment: config.maxPerPayment,
        maxPerSession: config.maxPerSession,
        chain: deps.chain,
        fetch: doFetch,
      })
    : null;

  const needApi = () => {
    if (!api) {
      throw new Error(
        "Merchant tools need an API key (mzk_test_… from the Mezout dashboard): run `npx -y @mezout/mcp init`, or set MEZOUT_API_KEY, then restart the server.",
      );
    }
    return api;
  };
  const needPayer = () => {
    if (!payer) {
      throw new Error(
        "Paying needs a funded Mezo testnet wallet key: run `npx -y @mezout/mcp init`, or set MEZOUT_PAYER_PRIVATE_KEY, then restart the server.",
      );
    }
    return payer;
  };

  server.registerTool(
    "create_invoice",
    {
      title: "Create invoice",
      description:
        "Create a Mezout invoice for an exact MUSD amount on Mezo testnet. Returns the invoice with its checkout_url, which a customer or another agent pays. The merchant receives the amount minus the signed fee.",
      inputSchema: {
        amount: amount.describe("MUSD to charge, e.g. \"25.00\""),
        reference: z.string().min(1).max(200).optional().describe("Your order number or note; the payer sees it"),
        success_url: z.string().max(2000).optional().describe("https URL the checkout returns to after payment"),
        expires_in: z.number().int().min(300).max(2_592_000).optional().describe("Seconds until the link expires (default 86400)"),
        idempotency_key: z.string().min(1).max(255).optional().describe("Reuse to retry safely without a second invoice"),
      },
    },
    ({ idempotency_key, ...body }) => run(() => needApi().createInvoice(body, idempotency_key ?? `mcp-${randomUUID()}`)),
  );

  server.registerTool(
    "get_invoice",
    {
      title: "Get invoice",
      description: "Retrieve one of your invoices by id (inv_…), with its status (pending, paid, expired, refunded) and payment.",
      inputSchema: { id: z.string().min(1).max(64) },
      annotations: { readOnlyHint: true },
    },
    ({ id }) => run(() => needApi().getInvoice(id)),
  );

  server.registerTool(
    "list_invoices",
    {
      title: "List invoices",
      description: "List your invoices, newest first. Page with starting_after set to the last id when has_more is true.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
        starting_after: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    (args) => run(() => needApi().listInvoices(args)),
  );

  server.registerTool(
    "refund",
    {
      title: "Request refund",
      description:
        "Request a refund of a paid invoice (all of what is left by default). Mezout holds no funds, so this creates a pending refund that the merchant sends from the dashboard's Payments tab.",
      inputSchema: {
        invoice: z.string().min(1).max(64),
        amount: amount.optional(),
        reason: z.string().max(200).optional(),
        idempotency_key: z.string().min(1).max(255).optional(),
      },
    },
    ({ idempotency_key, ...body }) => run(() => needApi().createRefund(body, idempotency_key ?? `mcp-${randomUUID()}`)),
  );

  server.registerTool(
    "verify_payment",
    {
      title: "Verify payment",
      description: "Check whether one of your invoices is paid, optionally by a given transaction hash (POST /v1/verify).",
      inputSchema: { invoice: z.string().min(1).max(64), transaction: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional() },
      annotations: { readOnlyHint: true },
    },
    (args) => run(() => needApi().verify(args)),
  );

  server.registerTool(
    "pay_invoice",
    {
      title: "Pay invoice",
      description:
        "Pay a Mezout invoice in MUSD from this agent's wallet on Mezo testnet, gasless through Mezout's relay. Takes the invoice's checkout_url. Refuses amounts over the configured per-payment or session limits. Returns the transaction hash.",
      inputSchema: {
        checkout_url: z.string().min(10).max(4000).describe("The invoice's checkout_url (https://…/pay/…)"),
        max_amount: amount.optional().describe("Refuse if the invoice asks for more than this many MUSD"),
      },
      annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    ({ checkout_url, max_amount }) =>
      run(async () => {
        const p = needPayer();
        const paid = await p.pay(checkout_url, max_amount ? { maxAmount: max_amount } : {});
        return { status: "paid", ...paid, budget: p.budget() };
      }),
  );

  server.registerTool(
    "fetch_paid_resource",
    {
      title: "Fetch with HTTP 402 payment",
      description:
        "Fetch a URL; if it answers 402 Payment Required with a Mezout (x402 'mezout' scheme) payment request, pay it in MUSD within the limits and retry with proof. Returns the final status, body and payment.",
      inputSchema: {
        url: z.string().url(),
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
        headers: z.record(z.string()).optional(),
        body: z.string().max(100_000).optional(),
      },
      annotations: { openWorldHint: true },
    },
    ({ url, method, headers, body }) =>
      run(async () => {
        const p = needPayer();
        if (!/^https?:$/.test(new URL(url).protocol)) throw new Error("Only http and https URLs");
        const { response, payment } = await fetchWithPayment(url, { method: method ?? "GET", headers, body, payer: p, fetch: doFetch });
        const text = await response.text();
        return {
          status: response.status,
          content_type: response.headers.get("content-type"),
          body: text.length > MAX_BODY_CHARS ? `${text.slice(0, MAX_BODY_CHARS)}… (truncated)` : text,
          payment: payment ?? null,
          budget: p.budget(),
        };
      }),
  );

  server.registerTool(
    "get_budget",
    {
      title: "Spending budget",
      description: "The paying wallet's address, and MUSD spent and remaining under this session's limits.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => run(async () => ({ payer: needPayer().address, ...needPayer().budget() })),
  );

  return server;
}
