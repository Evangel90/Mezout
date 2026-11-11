import Link from "next/link";
import { Showcase } from "@/components/site/Showcase";

const REPO = "https://github.com/Evangel90/Mezout";
const EXPLORER = "https://explorer.test.mezo.org/address";
const SOURCIFY = "https://repo.sourcify.dev/31611";

const contracts = [
  { name: "MezoutRouter", address: "0x7151473F1300c2529A2eEFaA517684e974A9b3E6" },
  { name: "MezoutAccountFactory", address: "0xeE85EE32488FF2D63eFe48159ddB59e6863cdF79" },
];

const builtOn = ["MUSD", "Mezo Passport", "Tigris", "ERC-4337", "EIP-712", "Sourcify"];

const methods = [
  { color: "bg-green-600", name: "Pay with MUSD", body: "Straight from their balance." },
  { color: "bg-[#f7931a]", name: "Pay with BTC", body: "Converted to MUSD at a live price, never above the price they approve." },
  { color: "bg-rose-600", name: "Pay with MEZO", body: "Converted the same way, with the same price cap." },
  { color: "bg-orange-600", name: "Borrow against BTC", body: "They keep their Bitcoin and borrow the MUSD inside the payment." },
];

const guarantees = [
  {
    icon: "equal",
    title: "Clear settlement",
    body: "The customer pays the listed amount. You see the fee and your net payout before you share a link, and both settle in the same transaction.",
  },
  {
    icon: "shield",
    title: "160% borrow floor",
    body: "A borrow that would leave the customer’s loan under 160% collateral is refused, so checkout never pushes anyone toward liquidation.",
  },
  {
    icon: "receipt",
    title: "One invoice, one payment",
    body: "Each invoice can be paid once, and every approval names a single invoice, so it can’t be reused for anything else.",
  },
  {
    icon: "arrow",
    title: "Non-custodial",
    body: "Money goes from the customer straight to your payout account. Mezout never holds funds or keys.",
  },
  {
    icon: "blocks",
    title: "Paid means on-chain",
    body: "Orders are marked paid only once the payment is confirmed on Mezo, never on a browser’s word.",
  },
  {
    icon: "check",
    title: "No admin keys",
    body: "No owner, no pause switch, no upgrades. The contract source is published and verified as an exact match.",
  },
];

const devPoints = [
  "REST API with API keys, idempotency keys and rate limits",
  "Signed webhooks, retried for 24 hours, with a delivery log",
  "WooCommerce plugin and Shopify app",
  "Embedded checkout with a drop-in script or React component",
  "MCP server and HTTP 402 paywall for AI agents",
];

const agentPoints = [
  {
    title: "Agents that pay",
    body: "The Mezout MCP server gives Claude, Cursor or any MCP client tools to pay invoices in MUSD, with no gas and no wallet pop-ups.",
  },
  {
    title: "APIs that charge per request",
    body: "Add one middleware to an Express or Next.js route. Unpaid requests get a 402 with a Mezout invoice, in the x402 v2 format; the agent pays and retries.",
  },
  {
    title: "Limits you set",
    body: "Caps per payment and per session, Mezo testnet only, Mezout’s own contracts only. An agent can’t be talked into paying anyone else.",
  },
  {
    title: "Same guarantees as checkout",
    body: "You receive exact MUSD, each invoice pays once, and every payment is confirmed on Mezo before your API serves the request.",
  },
];

const stats = [
  { value: "4", label: "ways for customers to pay" },
  { value: "0", label: "funds held by Mezout" },
  { value: "160%", label: "minimum collateral on any borrow" },
  { value: "0", label: "admin keys, pause switches or upgrades" },
];

const faqs = [
  {
    q: "What can my customers pay with?",
    a: "MUSD, BTC or MEZO, or MUSD borrowed against the Bitcoin in their Mezo loan. Checkout only shows the options their wallet can use, and you are paid in MUSD whichever they choose.",
  },
  {
    q: "Do I need a crypto wallet to get paid?",
    a: "No. Sign up with a passkey (Face ID, Touch ID, Windows Hello or your phone) and Mezout creates a payout account only you control, with free withdrawals. If you already use Mezo, you can be paid straight into your wallet instead.",
  },
  {
    q: "Does Mezout ever hold my money?",
    a: "No. Each payment goes from the customer to your payout account in a single transaction. Mezout issues invoices and pays network fees, but it has no way to move your funds.",
  },
  {
    q: "How do I know an order has been paid?",
    a: "Mezout marks an invoice paid only once the payment is confirmed on Mezo. Your dashboard updates within seconds, and your store gets a signed invoice.paid webhook.",
  },
  {
    q: "What does it cost?",
    a: "On testnet, a 1% platform fee paid by the merchant. The customer always pays the listed total; the fee comes out of your payout, and the dashboard shows gross, fee and net before you share a link.",
  },
  {
    q: "Can I use it with my store?",
    a: "Yes. Install the WooCommerce plugin or the Shopify app, create invoices from any backend with the REST API, or embed checkout on your own site.",
  },
  {
    q: "Can AI agents pay with Mezout?",
    a: "Yes. The Mezout MCP server lets an agent create, check and pay invoices within spending limits you set, and the HTTP 402 paywall lets your API charge agents per request. Payments settle in MUSD through the same contract as checkout.",
  },
  {
    q: "Is Mezout live on mainnet?",
    a: "Not yet. Mezout runs on Mezo testnet with test tokens that have no value. Mainnet follows a security review and passkey account recovery.",
  },
];

/** A full-width band with the page column's guide lines down both sides. */
function Band({
  id,
  tone = "white",
  className = "",
  children,
}: Readonly<{ id?: string; tone?: "white" | "stone" | "dark"; className?: string; children: React.ReactNode }>) {
  const bg = { white: "bg-white", stone: "bg-stone-50", dark: "bg-stone-950 text-white" }[tone];
  const line = tone === "dark" ? "border-stone-800" : "border-stone-200";
  return (
    <section id={id} className={`border-b ${line} ${bg}`}>
      <div className={`mx-auto max-w-6xl px-5 sm:border-x sm:px-10 ${line} ${className}`}>{children}</div>
    </section>
  );
}

function Eyebrow({ children, dark = false }: Readonly<{ children: React.ReactNode; dark?: boolean }>) {
  return (
    <p className={`flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] ${dark ? "text-stone-400" : "text-stone-500"}`}>
      <span className={`h-1.5 w-1.5 ${dark ? "bg-stone-400" : "bg-stone-900"}`} />
      {children}
    </p>
  );
}

/** An animation from public/motion (generated by docs/motion/generate.mjs). */
function Motion({ src, alt, width, height, priority = false }: Readonly<{ src: string; alt: string; width: number; height: number; priority?: boolean }>) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      className="relative h-auto w-full"
    />
  );
}

function Icon({ name }: Readonly<{ name: string }>) {
  const paths: Record<string, string> = {
    equal: "M5 9h14M5 15h14",
    shield: "M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z",
    receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
    arrow: "M4 12h15M13 6l6 6-6 6",
    blocks: "M4 4h7v7H4zM13 13h7v7h-7zM13 4h7v7h-7z",
    check: "M8.5 12.5l2.5 2.5 5-5.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  };
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white shadow-sm">
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-stone-800" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={paths[name]} />
      </svg>
    </span>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0 text-green-600" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="10" cy="10" r="8.2" />
      <path d="M6.6 10.3l2.2 2.2 4.6-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="overflow-x-clip">
      {/* Hero */}
      <Band className="grid items-center gap-12 py-16 lg:grid-cols-[1.08fr_0.92fr] lg:py-24">
        <div className="space-y-7">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-600 shadow-sm hover:border-stone-300"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            Live on Mezo testnet
            <span aria-hidden>→</span>
          </Link>
          <h1 className="text-[2.6rem] font-semibold leading-[1.04] tracking-tight [text-wrap:balance] sm:text-6xl">
            Get paid in exact MUSD.
            <span className="mt-2 block font-mono text-[2.2rem] font-normal tracking-[-0.06em] text-stone-500 sm:text-[3.4rem]">
              Let customers pay with Bitcoin.
            </span>
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-stone-600">
            Mezout is checkout for Mezo. Customers pay with MUSD, BTC or MEZO, or borrow against their Bitcoin, and AI
            agents can pay too. You are paid in stable MUSD, with the fee shown before you share a link.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-3 font-medium text-white hover:bg-stone-700">
              Start accepting payments <span aria-hidden>→</span>
            </Link>
            <Link href="/docs" className="rounded-full border border-stone-300 bg-white px-5 py-3 font-medium hover:bg-stone-100">
              Read the docs
            </Link>
          </div>
          <p className="text-sm text-stone-500">No wallet or seed phrase. Sign up with a passkey in under a minute.</p>
        </div>
        <div className="relative mx-auto w-full max-w-[500px]">
          <div
            aria-hidden
            className="absolute -inset-10 rounded-[3rem] bg-[radial-gradient(38%_38%_at_72%_28%,rgba(247,147,26,0.26),transparent),radial-gradient(42%_42%_at_22%_72%,rgba(22,163,74,0.18),transparent),radial-gradient(32%_32%_at_82%_82%,rgba(225,29,72,0.14),transparent)] blur-2xl"
          />
          <Motion
            src="/motion/06-receipt.svg"
            width={560}
            height={600}
            priority
            alt="A Mezout receipt for Satoshi’s Coffee Store: 25.00 MUSD, stamped paid. The payment method changes between BTC, MEZO, MUSD and borrowing against BTC, while the merchant always receives 25.00 MUSD."
          />
        </div>
      </Band>

      {/* Built on */}
      <Band className="py-8">
        <p className="mb-5 text-center text-sm text-stone-500">Built on Mezo, with open standards</p>
        <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {builtOn.map((b) => (
            <li key={b} className="text-lg font-semibold tracking-tight text-stone-400">
              {b}
            </li>
          ))}
        </ul>
      </Band>

      {/* Problem */}
      <Band tone="stone" className="reveal py-20 text-center sm:py-28">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex justify-center">
            <Eyebrow>The problem</Eyebrow>
          </div>
          <h2 className="text-3xl font-semibold tracking-tight [text-wrap:balance] sm:text-5xl">
            Bitcoin holders don’t want to sell.
            <span className="block text-stone-400">Merchants don’t want a wallet.</span>
          </h2>
          <p className="text-lg leading-relaxed text-stone-600">
            Most crypto checkouts fail one side. Customers have to convert before they can pay, or merchants end up
            holding a volatile asset, a seed phrase and gas tokens.{" "}
            <span className="font-medium text-stone-900">Mezout works for both, in a single payment.</span>
          </p>
        </div>
      </Band>

      {/* How it works */}
      <Band id="how" className="py-20 sm:py-24">
        <div className="mb-10 space-y-4 text-center">
          <div className="flex justify-center">
            <Eyebrow>How it works</Eyebrow>
          </div>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            One checkout. <span className="text-stone-400">Paid in MUSD.</span>
          </h2>
        </div>
        <Showcase />
      </Band>

      {/* Checkout */}
      <Band tone="stone" className="grid items-center gap-14 py-20 sm:py-24 lg:grid-cols-2">
        <div className="reveal space-y-6">
          <Eyebrow>Hosted checkout</Eyebrow>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">A checkout your customers already understand</h2>
          <p className="text-lg leading-relaxed text-stone-600">
            Send a link, show a QR code, or redirect from your store. Customers connect a wallet, see only the options
            they can use, and confirm once.
          </p>
          <ul className="divide-y divide-stone-200 border-y border-stone-200">
            {methods.map((m) => (
              <li key={m.name} className="flex items-start gap-3 py-3.5">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${m.color}`} />
                <span>
                  <span className="font-medium">{m.name}.</span> <span className="text-stone-600">{m.body}</span>
                </span>
              </li>
            ))}
          </ul>
          <Link href="/docs#quickstart" className="inline-flex items-center gap-1.5 font-medium hover:underline">
            Create your first invoice <span aria-hidden>→</span>
          </Link>
        </div>
        <div className="mx-auto w-full max-w-[460px]">
          <Motion
            src="/motion/07-checkout.svg"
            width={520}
            height={640}
            alt="The Mezout checkout for a 25.00 MUSD order: the customer picks Pay with BTC, signs one message with no network fee, and sees Payment complete."
          />
        </div>
      </Band>

      {/* Guarantees */}
      <Band className="py-20 sm:py-24">
        <div className="reveal mb-12 max-w-2xl space-y-4">
          <Eyebrow>Safe by design</Eyebrow>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            Enforced by the contract, <span className="text-stone-400">not by promises.</span>
          </h2>
        </div>
        <div className="reveal grid gap-px overflow-hidden rounded-2xl border border-stone-200 bg-stone-200 sm:grid-cols-2 lg:grid-cols-3">
          {guarantees.map((g) => (
            <div key={g.title} className="space-y-4 bg-white p-7">
              <Icon name={g.icon} />
              <h3 className="font-semibold">{g.title}</h3>
              <p className="text-sm leading-relaxed text-stone-600">{g.body}</p>
            </div>
          ))}
        </div>
      </Band>

      {/* Developers */}
      <Band id="developers" tone="stone" className="grid gap-14 py-20 sm:py-24 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="reveal space-y-6">
          <Eyebrow>For developers</Eyebrow>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Integrate in an afternoon.</h2>
          <p className="text-lg leading-relaxed text-stone-600">
            Create an invoice from your server, send the customer to its checkout link, and fulfil the order when the
            signed webhook arrives. Or install a plugin and skip the code.
          </p>
          <ul className="space-y-3">
            {devPoints.map((p) => (
              <li key={p} className="flex gap-3 text-stone-700">
                <Tick />
                {p}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/docs" className="rounded-full bg-stone-900 px-5 py-2.5 font-medium text-white hover:bg-stone-700">
              Read the docs
            </Link>
            <a href={REPO} className="rounded-full border border-stone-300 bg-white px-5 py-2.5 font-medium hover:bg-stone-100">
              View on GitHub
            </a>
          </div>
        </div>
        <div className="reveal min-w-0 space-y-4">
          <div className="overflow-hidden rounded-2xl bg-stone-900 shadow-xl shadow-stone-900/10">
            <div className="flex items-center justify-between border-b border-stone-700/60 px-4 py-2.5 text-xs text-stone-400">
              <span className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-stone-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-stone-700" />
                <span className="h-2.5 w-2.5 rounded-full bg-stone-700" />
              </span>
              Create an invoice
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-stone-300">
              <code>
                <span className="text-stone-500">$</span> curl https://usemezout.vercel.app/v1/invoices \{"\n"}
                {"    "}-H <span className="text-green-300">&quot;Authorization: Bearer mzk_test_…&quot;</span> \{"\n"}
                {"    "}-H <span className="text-green-300">&quot;Content-Type: application/json&quot;</span> \{"\n"}
                {"    "}-H <span className="text-green-300">&quot;Idempotency-Key: order-1001&quot;</span> \{"\n"}
                {"    "}-d <span className="text-green-300">&apos;{`{"amount": "25.00", "reference": "Order 1001"}`}&apos;</span>
                {"\n\n"}
                <span className="font-semibold text-green-400">201 Created</span>
                {"\n"}
                {`{ "id": "inv_3bf9a158b706b1412e77528f", "status": "pending",`}
                {"\n"}
                {`  "checkout_url": "https://usemezout.vercel.app/pay/eyJtIjoi…" }`}
              </code>
            </pre>
          </div>
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2.5 text-xs">
              <span className="font-mono text-stone-600">POST /webhooks/mezout</span>
              <span className="rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-700">Signature verified</span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-stone-600">
              <code>
                <span className="text-stone-400">Mezout-Signature: t=1761323464,v1=5f2a…</span>
                {"\n\n"}
                {"{\n"}
                {'  "type": '}
                <span className="font-semibold text-stone-900">&quot;invoice.paid&quot;</span>
                {",\n"}
                {'  "data": { "object": {\n'}
                {'    "id": "inv_3bf9a158b706b1412e77528f",\n'}
                {'    "status": "paid", "amount": "25", "reference": "Order 1001"\n'}
                {"  } }\n}"}
              </code>
            </pre>
          </div>
        </div>
      </Band>

      {/* AI agents */}
      <Band id="agents" tone="dark" className="grid gap-14 py-20 sm:py-24 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="reveal space-y-6">
          <Eyebrow dark>For AI agents</Eyebrow>
          <h2 className="text-3xl font-semibold tracking-tight [text-wrap:balance] sm:text-4xl">
            Let AI agents pay, and get paid. <span className="text-stone-400">Within limits you set.</span>
          </h2>
          <p className="text-lg leading-relaxed text-stone-300">
            Agents are becoming customers. Mezout lets them pay for goods, data and API calls in MUSD, settled on Mezo in
            seconds, with the same guarantees your human customers get.
          </p>
          <ul className="grid gap-px overflow-hidden rounded-2xl border border-stone-800 bg-stone-800 sm:grid-cols-2">
            {agentPoints.map((a) => (
              <li key={a.title} className="space-y-2 bg-stone-950 p-5">
                <h3 className="font-semibold text-white">{a.title}</h3>
                <p className="text-sm leading-relaxed text-stone-400">{a.body}</p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3 pt-2">
            <a href={`${REPO}/tree/main/packages/mcp`} className="rounded-full bg-white px-5 py-2.5 font-medium text-stone-900 hover:bg-stone-200">
              MCP server
            </a>
            <a href={`${REPO}/tree/main/packages/paywall`} className="rounded-full border border-stone-700 px-5 py-2.5 font-medium text-white hover:bg-stone-900">
              HTTP 402 paywall
            </a>
          </div>
        </div>
        <div className="reveal min-w-0 space-y-4">
          <div className="overflow-hidden rounded-2xl border border-stone-800 bg-stone-900">
            <div className="border-b border-stone-800 px-4 py-2.5 font-mono text-xs text-stone-400">app/api/report/route.ts</div>
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-stone-300">
              <code>
                <span className="text-stone-500">{"// Charge agents 0.05 MUSD per request"}</span>
                {"\n"}
                <span className="text-rose-300">import</span> {"{ withMezout402 }"} <span className="text-rose-300">from</span>{" "}
                <span className="text-green-300">&quot;@mezout/paywall/next&quot;</span>;{"\n\n"}
                <span className="text-rose-300">export const</span> GET = withMezout402({"\n"}
                {"  { apiKey: process.env.MEZOUT_API_KEY, price: "}
                <span className="text-green-300">&quot;0.05&quot;</span>
                {" },\n"}
                {"  async (req, ctx, payment) => Response.json({ report, paidBy: payment.payer }),\n"});
              </code>
            </pre>
          </div>
          <div className="overflow-hidden rounded-2xl border border-stone-800 bg-stone-900">
            <div className="flex items-center justify-between border-b border-stone-800 px-4 py-2.5 text-xs">
              <span className="font-mono text-stone-400">Agent</span>
              <span className="rounded-full bg-green-950 px-2 py-0.5 font-medium text-green-400">Paid on Mezo</span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-stone-300">
              <code>
                <span className="text-stone-500">GET /api/report</span>
                {"\n"}
                <span className="text-amber-300">402 Payment Required</span>
                {"  0.05 MUSD · invoice inv_7c1e…\n"}
                <span className="text-stone-500">pay_invoice → 0x9a4f…e21b</span>
                {"\n"}
                <span className="text-stone-500">GET /api/report  PAYMENT-SIGNATURE: …</span>
                {"\n"}
                <span className="font-semibold text-green-400">200 OK</span>
              </code>
            </pre>
          </div>
        </div>
      </Band>

      {/* Open and verifiable */}
      <Band id="contracts" className="py-20 sm:py-24">
        <div className="reveal grid gap-12 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-5">
            <Eyebrow>Open and verifiable</Eyebrow>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Check every claim yourself.</h2>
            <p className="text-lg leading-relaxed text-stone-600">
              The code is open source and the contracts are verified on Sourcify, so you can read exactly what runs.
              Mezout is on Mezo testnet, with test tokens only.
            </p>
            <ul className="divide-y divide-stone-200 rounded-2xl border border-stone-200 text-sm">
              {contracts.map((c) => (
                <li key={c.address} className="space-y-1 p-4">
                  <p className="font-medium">{c.name}</p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <a href={`${EXPLORER}/${c.address}`} className="break-all font-mono text-xs text-stone-600 underline decoration-stone-300 hover:text-stone-900">
                      {c.address}
                    </a>
                    <a href={`${SOURCIFY}/${c.address}`} className="text-xs font-medium text-green-700 hover:underline">
                      Verified source
                    </a>
                  </p>
                </li>
              ))}
            </ul>
            <a href={REPO} className="inline-flex items-center gap-1.5 font-medium hover:underline">
              Code on GitHub <span aria-hidden>→</span>
            </a>
          </div>
          <dl className="grid grid-cols-2 gap-px self-start overflow-hidden rounded-2xl border border-stone-200 bg-stone-200">
            {stats.map((s) => (
              <div key={s.label} className="space-y-2 bg-white p-6 sm:p-8">
                <dt className="sr-only">{s.label}</dt>
                <dd className="text-4xl font-semibold tracking-tight sm:text-5xl">{s.value}</dd>
                <dd className="text-sm text-stone-600">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Band>

      {/* FAQ */}
      <Band tone="stone" className="grid gap-10 py-20 sm:py-24 lg:grid-cols-[0.6fr_1.4fr]">
        <div className="space-y-4">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">Questions</h2>
          <p className="text-stone-600">
            Something else? The{" "}
            <Link href="/docs" className="text-stone-900 underline">
              API reference
            </Link>{" "}
            covers the details.
          </p>
        </div>
        <div className="divide-y divide-stone-200 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {faqs.map((f, i) => (
            <details key={f.q} className="group" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 font-medium hover:bg-stone-50 [&::-webkit-details-marker]:hidden">
                {f.q}
                <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-stone-400 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <p className="px-6 pb-6 leading-relaxed text-stone-600">{f.a}</p>
            </details>
          ))}
        </div>
      </Band>

      {/* Closing call to action */}
      <Band tone="dark" className="py-24 text-center sm:py-28">
        <div className="mx-auto max-w-2xl space-y-6">
          <h2 className="text-3xl font-semibold tracking-tight [text-wrap:balance] sm:text-5xl">
            Start accepting <span className="whitespace-nowrap">Bitcoin-backed</span> payments.
          </h2>
          <p className="text-lg text-stone-400">
            Create a merchant account with a passkey, share your first payment link, and get paid in MUSD.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-medium text-stone-900 hover:bg-stone-200">
              Get started <span aria-hidden>→</span>
            </Link>
            <Link href="/docs" className="rounded-full border border-stone-700 px-6 py-3 font-medium text-white hover:bg-stone-900">
              Read the docs
            </Link>
          </div>
          <p className="text-sm text-stone-500">No wallet, no seed phrase, no gas. Testnet only.</p>
        </div>
      </Band>
    </div>
  );
}
