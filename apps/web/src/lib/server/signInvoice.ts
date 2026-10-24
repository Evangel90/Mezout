import "server-only";
import { bytesToHex, type Address } from "viem";
import { encodeSignedInvoice, invoiceTypes, routerDomain, type Invoice } from "@mezout/sdk";
import { invoiceSigner } from "./clients";
import { serverEnv } from "./env";

export type InvoiceSigner = (invoice: Invoice) => Promise<string>;

export const randomOrderId = () => bytesToHex(crypto.getRandomValues(new Uint8Array(32)));

/** Signs an invoice with the platform key and returns the payment-link token. */
export const signInvoiceToken: InvoiceSigner = async (invoice) => {
  const router: Address = serverEnv.router();
  const signature = await invoiceSigner().signTypedData({
    domain: routerDomain(router),
    types: invoiceTypes,
    primaryType: "Invoice",
    message: invoice,
  });
  return encodeSignedInvoice({ invoice, signature });
};
