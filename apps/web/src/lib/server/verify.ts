import "server-only";
import { formatUnits, getAddress, isAddressEqual, isHex, parseEventLogs, type Hex, type PublicClient } from "viem";
import { MEZO_TESTNET_NETWORK, MEZOUT_SCHEME, mezoTestnetAddresses, mezoutRouterAbi } from "@mezout/sdk";
import type { Merchant } from "./apiKeys";
import type { Db } from "./db/client";
import { findInvoiceView, invoiceStatus, METHODS, type InvoiceView } from "./invoices";

export type ReceiptReader = Pick<PublicClient, "getTransactionReceipt">;

/** What the merchant server asks about: an invoice, optionally the transaction the agent says paid it, and the terms it asked for. */
export type VerifyInput = {
  invoice: string;
  transaction?: Hex;
  /** x402 PaymentRequirements the merchant's 402 answer offered. Checked against the invoice when given. */
  requirements?: { scheme?: string; network?: string; asset?: string; amount?: string; payTo?: string; extra?: { invoice?: string } };
};

export type InvalidReason =
  | "invoice_not_found"
  | "invoice_not_paid"
  | "invoice_expired"
  | "invoice_refunded"
  | "requirements_mismatch"
  | "transaction_not_found"
  | "transaction_failed"
  | "transaction_mismatch";

/** A payment as the router recorded it, from the index or straight from the transaction receipt. */
export type VerifiedPayment = {
  payer: string;
  amount: string;
  fee: string;
  method: string;
  tx_hash: string;
  block_number: number;
  source: "index" | "receipt";
};

export type VerifyResult =
  | { found: false }
  | { found: true; view: InvoiceView; isValid: true; payment: VerifiedPayment }
  | { found: true; view: InvoiceView; isValid: false; invalidReason: InvalidReason; detail: string };

const invalid = (view: InvoiceView, invalidReason: InvalidReason, detail: string): VerifyResult => ({
  found: true,
  view,
  isValid: false,
  invalidReason,
  detail,
});

/** Compares x402 terms with the invoice, so proof for a cheaper invoice cannot settle a dearer request. */
function requirementsMismatch(view: InvoiceView, merchant: Merchant, req: NonNullable<VerifyInput["requirements"]>): string | null {
  if (req.scheme !== undefined && req.scheme !== MEZOUT_SCHEME) return `scheme must be "${MEZOUT_SCHEME}"`;
  if (req.network !== undefined && req.network !== MEZO_TESTNET_NETWORK) return `network must be ${MEZO_TESTNET_NETWORK}`;
  if (req.asset !== undefined && !(isHex(req.asset) && isAddressEqual(req.asset, mezoTestnetAddresses.musd))) return "asset must be MUSD";
  if (req.amount !== undefined && req.amount !== view.row.amount) return "amount does not match the invoice";
  if (req.payTo !== undefined && !(isHex(req.payTo) && isAddressEqual(req.payTo, getAddress(merchant.payoutAddress)))) {
    return "payTo does not match the invoice's merchant";
  }
  if (req.extra?.invoice !== undefined && req.extra.invoice !== view.row.id) return "extra.invoice does not match";
  return null;
}

/**
 * Checks that one of the merchant's invoices is paid. Read-only, as x402's /verify must be: it never records anything,
 * so the caller (the paywall middleware) is responsible for accepting each invoice once.
 *
 * The index is the first source. If it has not seen the payment yet and the caller names a transaction, the receipt
 * is read directly: it must have succeeded and contain the invoice router's Paid event for this order, merchant and
 * amount. `sync` lets the route catch the indexer up first, as GET /v1/invoices/:id does.
 */
export async function verifyInvoicePayment(
  db: Db,
  merchant: Merchant,
  input: VerifyInput,
  chain: ReceiptReader,
  opts: { now?: number; sync?: () => Promise<unknown> } = {},
): Promise<VerifyResult> {
  let view = await findInvoiceView(db, merchant, input.invoice);
  if (!view) return { found: false };
  if (input.requirements) {
    const mismatch = requirementsMismatch(view, merchant, input.requirements);
    if (mismatch) return invalid(view, "requirements_mismatch", mismatch);
  }
  if (!view.payment && opts.sync) {
    await opts.sync().catch(() => null);
    view = (await findInvoiceView(db, merchant, input.invoice)) ?? view;
  }

  if (view.payment) {
    const p = view.payment;
    if (input.transaction && p.txHash.toLowerCase() !== input.transaction.toLowerCase()) {
      return invalid(view, "transaction_mismatch", "The invoice was paid by a different transaction.");
    }
    if (invoiceStatus(view, opts.now) === "refunded") return invalid(view, "invoice_refunded", "The payment was refunded.");
    return {
      found: true,
      view,
      isValid: true,
      payment: {
        payer: p.payer,
        amount: formatUnits(BigInt(p.amount), 18),
        fee: formatUnits(BigInt(p.fee), 18),
        method: p.method,
        tx_hash: p.txHash,
        block_number: p.blockNumber,
        source: "index",
      },
    };
  }

  if (!input.transaction) {
    return invoiceStatus(view, opts.now) === "expired"
      ? invalid(view, "invoice_expired", "The invoice expired unpaid.")
      : invalid(view, "invoice_not_paid", "No payment for this invoice yet.");
  }

  let receipt;
  try {
    receipt = await chain.getTransactionReceipt({ hash: input.transaction });
  } catch {
    return invalid(view, "transaction_not_found", "No mined transaction with that hash on Mezo testnet.");
  }
  if (receipt.status !== "success") return invalid(view, "transaction_failed", "The transaction reverted.");

  const router = getAddress(view.row.router);
  const paid = parseEventLogs({ abi: mezoutRouterAbi, eventName: "Paid", logs: receipt.logs }).find(
    (log) =>
      isAddressEqual(log.address, router) &&
      log.args.orderId.toLowerCase() === view.row.orderId.toLowerCase() &&
      isAddressEqual(log.args.merchant, getAddress(merchant.payoutAddress)) &&
      log.args.amount === BigInt(view.row.amount),
  );
  if (!paid) return invalid(view, "transaction_mismatch", "The transaction did not pay this invoice.");
  return {
    found: true,
    view,
    isValid: true,
    payment: {
      payer: getAddress(paid.args.payer),
      amount: formatUnits(paid.args.amount, 18),
      fee: formatUnits(paid.args.fee, 18),
      method: METHODS[paid.args.method] ?? String(paid.args.method),
      tx_hash: paid.transactionHash,
      block_number: Number(paid.blockNumber),
      source: "receipt",
    },
  };
}
