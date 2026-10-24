// Acts as a customer: creates an invoice through the API, signs it like a wallet would, and pays via the relayer.
// Usage (Mac terminal, inside Mezout/apps/web):
//   APP_URL=http://localhost:3000 PAYER_PRIVATE_KEY=0x... MERCHANT=0x... AMOUNT=25 node scripts/pay-invoice.mjs
import { createPublicClient, http, parseAbi, parseSignature } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const { APP_URL = "http://localhost:3000", PAYER_PRIVATE_KEY, MERCHANT, AMOUNT = "25", ROUTER, RPC_URL = "https://rpc.test.mezo.org" } =
  process.env;
if (!PAYER_PRIVATE_KEY || !MERCHANT || !ROUTER) throw new Error("Set PAYER_PRIVATE_KEY, MERCHANT and ROUTER");

const MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";
const payer = privateKeyToAccount(PAYER_PRIVATE_KEY);
const client = createPublicClient({ transport: http(RPC_URL) });
const chainId = await client.getChainId();
const musd = parseAbi([
  "function nonces(address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);
const router = parseAbi(["function paid(bytes32) view returns (bool)"]);

const post = async (path, body) => {
  const res = await fetch(new URL(path, APP_URL), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path}: ${json.error}`);
  return json;
};

const { token, orderId } = await post("/api/invoices", { merchant: MERCHANT, amount: AMOUNT });
const w = JSON.parse(Buffer.from(token, "base64url").toString());
const invoice = { merchant: w.m, amount: BigInt(w.a), fee: BigInt(w.f), orderId: w.o, expiry: BigInt(w.e) };
console.log("invoice", orderId, `${AMOUNT} MUSD`);

const invoiceFields = [
  { name: "merchant", type: "address" },
  { name: "amount", type: "uint256" },
  { name: "fee", type: "uint256" },
  { name: "orderId", type: "bytes32" },
  { name: "expiry", type: "uint64" },
];
const payerSig = await payer.signTypedData({
  domain: { name: "MezoutRouter", version: "1", chainId, verifyingContract: ROUTER },
  types: { Payment: [{ name: "invoice", type: "Invoice" }, { name: "payer", type: "address" }], Invoice: invoiceFields },
  primaryType: "Payment",
  message: { invoice, payer: payer.address },
});
const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
const permitSig = await payer.signTypedData({
  domain: { name: "Mezo USD", version: "1", chainId, verifyingContract: MUSD },
  types: {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  primaryType: "Permit",
  message: { owner: payer.address, spender: ROUTER, value: invoice.amount, nonce: await client.readContract({ address: MUSD, abi: musd, functionName: "nonces", args: [payer.address] }), deadline },
});
const { r, s, v, yParity } = parseSignature(permitSig);

const before = await client.readContract({ address: MUSD, abi: musd, functionName: "balanceOf", args: [MERCHANT] });
const { hash } = await post("/api/relay", {
  method: "MUSD",
  token,
  payer: payer.address,
  payerSig,
  permit: { deadline: deadline.toString(), v: Number(v ?? BigInt(yParity + 27)), r, s },
});
console.log("tx", hash);
const receipt = await client.waitForTransactionReceipt({ hash });
const after = await client.readContract({ address: MUSD, abi: musd, functionName: "balanceOf", args: [MERCHANT] });
const isPaid = await client.readContract({ address: ROUTER, abi: router, functionName: "paid", args: [invoice.orderId] });
console.log("status", receipt.status, "paid", isPaid, "merchant received", (after - before).toString());
if (receipt.status !== "success" || !isPaid || after - before !== invoice.amount - invoice.fee) process.exit(1);
