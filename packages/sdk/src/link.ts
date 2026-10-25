import { getAddress, isHex, type Address, type Hex } from "viem";
import { mezoTestnetAddresses } from "./addresses";
import type { Invoice } from "./typedData";

/** `router` is the MezoutRouter the signature is for; links made before it existed omit it. */
export type SignedInvoice = { invoice: Invoice; signature: Hex; router?: Address };

type Wire = { m: string; a: string; f: string; o: string; e: string; s: string; r?: string };

const toBase64Url = (s: string) =>
  btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

/** Self-contained payment link token: the invoice plus the platform signature. */
export function encodeSignedInvoice({ invoice, signature, router }: SignedInvoice): string {
  const wire: Wire = {
    m: invoice.merchant,
    a: invoice.amount.toString(),
    f: invoice.fee.toString(),
    o: invoice.orderId,
    e: invoice.expiry.toString(),
    s: signature,
    ...(router && { r: router }),
  };
  return toBase64Url(JSON.stringify(wire));
}

export function decodeSignedInvoice(token: string): SignedInvoice {
  const w = JSON.parse(fromBase64Url(token)) as Wire;
  if (!isHex(w.o) || w.o.length !== 66 || !isHex(w.s)) throw new Error("Malformed payment link");
  return {
    invoice: {
      merchant: getAddress(w.m),
      amount: BigInt(w.a),
      fee: BigInt(w.f),
      orderId: w.o,
      expiry: BigInt(w.e),
    },
    signature: w.s,
    ...(w.r !== undefined && { router: getAddress(w.r) }),
  };
}

/** The router a payment link was signed for. */
export const linkRouter = (signed: SignedInvoice): Address => signed.router ?? mezoTestnetAddresses.mezoutRouterV1;
