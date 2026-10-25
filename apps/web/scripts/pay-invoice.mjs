// Acts as a customer: creates an invoice through the API, signs it like a wallet would, and pays via the relayer.
// Usage (Mac terminal, inside Mezout/apps/web):
//   APP_URL=http://localhost:3000 ROUTER=0x... PAYER_PRIVATE_KEY=0x... API_KEY=mzk_test_... AMOUNT=25 [METHOD=BORROW FROM_BALANCE=0] node scripts/pay-invoice.mjs
// METHOD=MEZO or METHOD=BTC swaps on Tigris with a 1% slippage cap (SLIPPAGE_BPS=100).
// API_KEY is the merchant's key from the dashboard; the invoice pays that merchant. To pay an existing invoice or
// dashboard link instead, pass TOKEN=<the part of the checkout URL after /pay/> instead of API_KEY and AMOUNT.
import { createPublicClient, http, parseAbi, parseSignature } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const {
  APP_URL = "http://localhost:3000",
  PAYER_PRIVATE_KEY,
  API_KEY,
  AMOUNT = "25",
  ROUTER,
  RPC_URL = "https://rpc.test.mezo.org",
  METHOD = "MUSD",
  FROM_BALANCE = "0",
  SLIPPAGE_BPS = "100",
  TOKEN,
} = process.env;
if (!PAYER_PRIVATE_KEY || !ROUTER || !(API_KEY || TOKEN)) throw new Error("Set PAYER_PRIVATE_KEY, ROUTER and API_KEY or TOKEN");

const MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";
const BOS = "0xD757e3646AF370b15f32EB557F0F8380Df7D639e";
const SWAP_TOKENS = {
  BTC: { address: "0x7b7C000000000000000000000000000000000000", name: "BTC" },
  MEZO: { address: "0x7B7c000000000000000000000000000000000001", name: "MEZO" },
};
const payer = privateKeyToAccount(PAYER_PRIVATE_KEY);
const client = createPublicClient({ transport: http(RPC_URL) });
const chainId = await client.getChainId();
const musd = parseAbi([
  "function nonces(address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);
const router = parseAbi([
  "function paid(bytes32) view returns (bool)",
  "function quoteSwapIn(address tokenIn, uint256 amountOut) view returns (uint256)",
]);
const bos = parseAbi(["function getNonce(address) view returns (uint256)"]);

const post = async (path, body, headers = {}) => {
  const res = await fetch(new URL(path, APP_URL), { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path}: ${json.error}`);
  return json;
};

const token = TOKEN
  ? TOKEN
  : (await post("/v1/invoices", { amount: AMOUNT }, { authorization: `Bearer ${API_KEY}` })).checkout_url.split("/pay/")[1];
const w = JSON.parse(Buffer.from(token, "base64url").toString());
const invoice = { merchant: w.m, amount: BigInt(w.a), fee: BigInt(w.f), orderId: w.o, expiry: BigInt(w.e) };
console.log("invoice", invoice.orderId, `${Number(invoice.amount) / 1e18} MUSD`);

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
const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};
const signPermit = async (value, token = { address: MUSD, name: "Mezo USD" }) => {
  const nonce = await client.readContract({ address: token.address, abi: musd, functionName: "nonces", args: [payer.address] });
  const sig = await payer.signTypedData({
    domain: { name: token.name, version: "1", chainId, verifyingContract: token.address },
    types: permitTypes,
    primaryType: "Permit",
    message: { owner: payer.address, spender: ROUTER, value, nonce, deadline },
  });
  const { r, s, v, yParity } = parseSignature(sig);
  return { deadline: deadline.toString(), v: Number(v ?? BigInt(yParity + 27)), r, s };
};
const zero = `0x${"00".repeat(32)}`;

const before = await client.readContract({ address: MUSD, abi: musd, functionName: "balanceOf", args: [invoice.merchant] });
let body;
if (METHOD === "BORROW") {
  const fromBalance = BigInt(FROM_BALANCE) * 10n ** 18n;
  const borrowed = invoice.amount - fromBalance;
  const nonce = await client.readContract({ address: BOS, abi: bos, functionName: "getNonce", args: [payer.address] });
  const signature = await payer.signTypedData({
    domain: { name: "BorrowerOperationsSignatures", version: "1", chainId, verifyingContract: BOS },
    types: {
      WithdrawMUSD: [
        { name: "amount", type: "uint256" },
        { name: "borrower", type: "address" },
        { name: "recipient", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "WithdrawMUSD",
    message: { amount: borrowed, borrower: payer.address, recipient: ROUTER, nonce, deadline },
  });
  body = {
    method: "BORROW",
    token,
    payer: payer.address,
    payerSig,
    fromBalance: fromBalance.toString(),
    permit: fromBalance > 0n ? await signPermit(fromBalance) : { deadline: "0", v: 0, r: zero, s: zero },
    borrow: { deadline: deadline.toString(), signature },
  };
} else if (SWAP_TOKENS[METHOD]) {
  const tokenIn = SWAP_TOKENS[METHOD];
  const quote = await client.readContract({ address: ROUTER, abi: router, functionName: "quoteSwapIn", args: [tokenIn.address, invoice.amount] });
  const maxAmountIn = (quote * (10_000n + BigInt(SLIPPAGE_BPS))) / 10_000n;
  const limit = { maxAmountIn, deadline: BigInt(Math.floor(Date.now() / 1000) + 120) };
  console.log(`quote ${Number(quote) / 1e18} ${METHOD}, cap ${Number(maxAmountIn) / 1e18}`);
  const swapSig = await payer.signTypedData({
    domain: { name: "MezoutRouter", version: "1", chainId, verifyingContract: ROUTER },
    types: {
      SwapPayment: [
        { name: "invoice", type: "Invoice" },
        { name: "payer", type: "address" },
        { name: "tokenIn", type: "address" },
        { name: "maxAmountIn", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
      Invoice: invoiceFields,
    },
    primaryType: "SwapPayment",
    message: { invoice, payer: payer.address, tokenIn: tokenIn.address, ...limit },
  });
  body = {
    method: METHOD,
    token,
    payer: payer.address,
    payerSig: swapSig,
    limit: { maxAmountIn: maxAmountIn.toString(), deadline: limit.deadline.toString() },
    permit: await signPermit(maxAmountIn, tokenIn),
  };
} else {
  body = { method: "MUSD", token, payer: payer.address, payerSig, permit: await signPermit(invoice.amount) };
}
const { hash } = await post("/api/relay", body);
console.log("tx", hash);
const receipt = await client.waitForTransactionReceipt({ hash });
const after = await client.readContract({ address: MUSD, abi: musd, functionName: "balanceOf", args: [invoice.merchant] });
const isPaid = await client.readContract({ address: ROUTER, abi: router, functionName: "paid", args: [invoice.orderId] });
console.log("status", receipt.status, "paid", isPaid, "merchant received", (after - before).toString());
if (receipt.status !== "success" || !isPaid || after - before !== invoice.amount - invoice.fee) process.exit(1);
