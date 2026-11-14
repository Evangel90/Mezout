import { parseSignature, type Address, type Hex, type TypedDataDefinition } from "viem";
import { decodeSignedInvoice, linkRouter } from "./link";
import { musdDomain, paymentTypes, permitTypes, routerDomain } from "./typedData";

/** Anything that can sign EIP-712 data as one address: a viem LocalAccount, or a wallet client bound to an account. */
export type TypedDataSigner = {
  address: Address;
  signTypedData: (args: TypedDataDefinition) => Promise<Hex>;
};

/** The body `/api/relay` takes for a MUSD payment, exactly as the checkout sends it. */
export type MusdRelayBody = {
  method: "MUSD";
  token: string;
  payer: Address;
  payerSig: Hex;
  permit: { deadline: string; v: number; r: Hex; s: Hex };
};

/** Splits a permit signature into the router's `{deadline, v, r, s}` struct, as decimal strings for JSON. */
export function splitPermitSignature(sig: Hex, deadline: bigint): MusdRelayBody["permit"] {
  const { r, s, v, yParity } = parseSignature(sig);
  return { deadline: deadline.toString(), v: Number(v ?? BigInt(yParity + 27)), r, s };
}

/**
 * Signs the two messages a gasless MUSD payment needs: the `Payment` (binding the invoice to this payer, for the
 * link's router) and the MUSD permit for exactly the invoice amount to that router. `musdNonce` is the payer's current
 * `MUSD.nonces(payer)`. The result is the relay body; treat it as secret until it is sent.
 */
export async function signMusdPayment(opts: {
  token: string;
  signer: TypedDataSigner;
  musdNonce: bigint;
  permitDeadline: bigint;
  chainId?: number;
}): Promise<MusdRelayBody> {
  const signed = decodeSignedInvoice(opts.token);
  const router = linkRouter(signed);
  const payer = opts.signer.address;
  const payerSig = await opts.signer.signTypedData({
    domain: routerDomain(router, opts.chainId),
    types: paymentTypes,
    primaryType: "Payment",
    message: { invoice: signed.invoice, payer },
  } as TypedDataDefinition);
  const permitSig = await opts.signer.signTypedData({
    domain: musdDomain(opts.chainId),
    types: permitTypes,
    primaryType: "Permit",
    message: { owner: payer, spender: router, value: signed.invoice.amount, nonce: opts.musdNonce, deadline: opts.permitDeadline },
  } as TypedDataDefinition);
  return { method: "MUSD", token: opts.token, payer, payerSig, permit: splitPermitSignature(permitSig, opts.permitDeadline) };
}

/** The body `/api/relay` takes for a payment from a `MezoutAgentWallet`, signed by one of its session keys. */
export type AgentWalletRelayBody = {
  method: "AGENT_WALLET";
  token: string;
  /** The agent wallet that pays (the router's payer). */
  wallet: Address;
  /** The session key the owner approved on that wallet. */
  agent: Address;
  agentSig: Hex;
};

/**
 * Signs a payment from an agent wallet with its session key: the router's own EIP-712 `Payment`, with the wallet as
 * payer. No permit: the wallet approves the router itself, for exactly the invoice, inside `pay`. The relay calls
 * `wallet.pay(invoice, invoiceSig, agent, agentSig)` and the wallet enforces the owner's limits on-chain.
 */
export async function signAgentWalletPayment(opts: {
  token: string;
  wallet: Address;
  signer: TypedDataSigner;
  chainId?: number;
}): Promise<AgentWalletRelayBody> {
  const signed = decodeSignedInvoice(opts.token);
  const agentSig = await opts.signer.signTypedData({
    domain: routerDomain(linkRouter(signed), opts.chainId),
    types: paymentTypes,
    primaryType: "Payment",
    message: { invoice: signed.invoice, payer: opts.wallet },
  } as TypedDataDefinition);
  return { method: "AGENT_WALLET", token: opts.token, wallet: opts.wallet, agent: opts.signer.address, agentSig };
}

/** Extracts the payment-link token from a checkout URL (`…/pay/<token>`) or returns a bare token unchanged. */
export function paymentLinkToken(urlOrToken: string): string {
  const trimmed = urlOrToken.trim();
  const match = /\/pay\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/.exec(trimmed);
  return match ? match[1] : trimmed;
}
