import Link from "next/link";
import type { ReactNode } from "react";
import { AgentFlow } from "@/components/site/motion/AgentFlow";
import { CheckoutDuo } from "@/components/site/motion/CheckoutDuo";
import { Showcase } from "@/components/site/Showcase";

const REPO = "https://github.com/Evangel90/Mezout";
const EXPLORER = "https://explorer.test.mezo.org/address";
const SOURCIFY = "https://repo.sourcify.dev/31611";

const contracts = [
  { name: "MezoutRouter", address: "0x7151473F1300c2529A2eEFaA517684e974A9b3E6" },
  { name: "MezoutAccountFactory", address: "0xeE85EE32488FF2D63eFe48159ddB59e6863cdF79" },
];

const builtOn = ["MUSD", "Mezo Passport", "Tigris", "ERC-4337", "EIP-712", "Model Context Protocol", "x402", "Sourcify"];

const facts = [
  { value: "4", label: "ways for people to pay: MUSD, BTC, MEZO or a loan against BTC" },
  { value: "160%", label: "minimum collateral on any borrow, enforced at checkout" },
  { value: "402", label: "the HTTP status agents pay through, in the x402 v2 format" },
  { value: "0", label: "admin keys, pause switches or upgrades on the contracts" },
];

const methods = [
  { dot: "bg-musd-500", name: "Pay with MUSD", body: "Straight from their balance." },
  { dot: "bg-[#f7931a]", name: "Pay with BTC", body: "Swapped to MUSD at a live price, never above the price they approve." },
  { dot: "bg-rose-600", name: "Pay with MEZO", body: "Swapped the same way, with the same price cap." },
  { dot: "bg-signal-600", name: "Borrow against BTC", body: "They keep their Bitcoin and borrow the MUSD inside the payment." },
];

const mcpTools = ["create_invoice", "get_invoice", "list_invoices", "refund", "verify_payment", "pay_invoice", "fetch_paid_resource", "get_budget"];

const guarantees = [
  { icon: "equal", title: "Exact MUSD, every time", body: "The customer pays the listed amount and you see the fee and your net payout before you share a link. Both settle in the same transaction." },
  { icon: "arrow", title: "Non-custodial", body: "Money goes from the payer straight to your payout account. Mezout never holds funds or keys." },
  { icon: "check", title: "No admin keys", body: "No owner, no pause switch, no upgrades. The contract source is published and verified as an exact match." },
  { icon: "shield", title: "160% borrow floor", body: "A borrow that would leave the customer’s loan under 160% collateral is refused, so checkout never pushes anyone toward liquidation." },
  { icon: "receipt", title: "One invoice, one payment", body: "Each invoice can be paid once, and every approval names a single invoice, so it can’t be reused for anything else." },
  { icon: "blocks", title: "Paid means on-chain", body: "Orders, and agents’ API calls, count as paid only once the payment is confirmed on Mezo, never on a browser’s word." },
];

const integrations = [
  { name: "REST API", body: "API keys, idempotency keys and rate limits. Create invoices from any backend.", href: "/docs#quickstart", tag: "Developers" },
  { name: "Signed webhooks", body: "invoice.paid and refund events, retried for 24 hours, with a delivery log.", href: "/docs#webhooks", tag: "Developers" },
  { name: "Embedded checkout", body: "Open checkout in a modal on your own site with a drop-in script or React component.", href: "/docs#embedded-checkout", tag: "Developers" },
  { name: "WooCommerce plugin", body: "Adds Mezout to classic and block checkouts.", href: `${REPO}/tree/main/plugins/woocommerce`, tag: "Stores" },
  { name: "Shopify app", body: "Adds a Mezout payment step to orders.", href: `${REPO}/tree/main/plugins/shopify`, tag: "Stores" },
  { name: "MCP server", body: "Tools for agents to create, check, refund and pay invoices within caps.", href: "/docs#ai-agents", tag: "Agents" },
];

const faqs = [
  {
    q: "What can people pay with?",
    a: "MUSD, BTC or MEZO, or MUSD borrowed against the Bitcoin in their Mezo loan. Checkout only shows the options their wallet can use, and you are paid in MUSD whichever they choose.",
  },
  {
    q: "How do AI agents pay?",
    a: "Two ways. The Mezout MCP server gives Claude, Cursor or any MCP client tools to create, check and pay invoices, within per-payment and per-session caps you set. And the HTTP 402 paywall lets your API answer unpaid requests with 402 Payment Required and a Mezout invoice, in the x402 v2 format; the agent pays and retries.",
  },
  {
    q: "Do I need a crypto wallet to get paid?",
    a: "No. Sign up with a passkey (Face ID, Touch ID, Windows Hello or your phone) and Mezout creates a payout account only you control, with free withdrawals. If you already use Mezo, you can be paid straight into your wallet instead.",
  },
  {
    q: "Does Mezout ever hold my money?",
    a: "No. Each payment goes from the payer to your payout account in a single transaction. Mezout issues invoices and pays network fees, but it has no way to move your funds.",
  },
  {
    q: "How do I know an order has been paid?",
    a: "Mezout marks an invoice paid only once the payment is confirmed on Mezo. Your dashboard updates within seconds, and your store gets a signed invoice.paid webhook. The 402 paywall serves the request only after the same check.",
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
    q: "Is Mezout live on mainnet?",
    a: "Not yet. Mezout runs on Mezo testnet with test tokens that have no value. Mainnet follows a security review and passkey account recovery.",
  },
];

/* Building blocks ------------------------------------------------------------------------------------------------ */

function Section({
  id,
  tone = "white",
  className = "",
  children,
}: Readonly<{ id?: string; tone?: "white" | "canvas" | "dark"; className?: string; children: ReactNode }>) {
  const bg = { white: "bg-white", canvas: "bg-canvas", dark: "on-dark bg-ink text-white" }[tone];
  return (
    <section id={id} className={`${bg} scroll-mt-16`}>
      <div className={`mx-auto max-w-7xl px-4 sm:px-6 ${className}`}>{children}</div>
    </section>
  );
}

function Eyebrow({ children, tone = "ink" }: Readonly<{ children: ReactNode; tone?: "ink" | "signal" | "agent" | "light" }>) {
  const color = { ink: "text-stone-500", signal: "text-signal-700", agent: "text-agent-300", light: "text-stone-400" }[tone];
  return <p className={`eyebrow ${color}`}>{children}</p>;
}

function Heading({ eyebrow, title, body, center = false, dark = false, eyebrowTone }: Readonly<{ eyebrow: string; title: ReactNode; body?: ReactNode; center?: boolean; dark?: boolean; eyebrowTone?: "ink" | "signal" | "agent" | "light" }>) {
  return (
    <div className={`reveal max-w-3xl space-y-5 ${center ? "mx-auto text-center" : ""}`}>
      <Eyebrow tone={eyebrowTone ?? (dark ? "light" : "ink")}>{eyebrow}</Eyebrow>
      <h2 className="display-2 [text-wrap:balance]">{title}</h2>
      {body && <p className={`text-lg leading-relaxed sm:text-xl ${dark ? "text-stone-400" : "text-stone-600"}`}>{body}</p>}
    </div>
  );
}

/** An animation from public/motion (generated by docs/motion/generate.mjs). */
function Motion({ src, alt, width, height }: Readonly<{ src: string; alt: string; width: number; height: number }>) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={width} height={height} loading="lazy" className="relative h-auto w-full" />;
}

function Icon({ name, className = "h-5 w-5" }: Readonly<{ name: string; className?: string }>) {
  const paths: Record<string, string> = {
    equal: "M5 9h14M5 15h14",
    shield: "M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z",
    receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
    arrow: "M4 12h15M13 6l6 6-6 6",
    blocks: "M4 4h7v7H4zM13 13h7v7h-7zM13 4h7v7h-7z",
    check: "M8.5 12.5l2.5 2.5 5-5.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
    person: "M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20c.8-3.6 3.6-6 7-6s6.2 2.4 7 6",
    bot: "M12 4v3M7 7h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM9.5 12.5h.01M14.5 12.5h.01M9.5 16h5",
    tick: "M5 12.5l4.5 4.5L19 7.5",
  };
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[name]} />
    </svg>
  );
}

function ArrowLink({ href, children, dark = false }: Readonly<{ href: string; children: ReactNode; dark?: boolean }>) {
  const cls = `group inline-flex items-center gap-1.5 font-medium ${dark ? "text-white" : "text-ink"}`;
  const inner = (
    <>
      <span className="underline decoration-transparent decoration-2 underline-offset-4 transition-colors group-hover:decoration-signal-500">{children}</span>
      <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </>
  );
  return href.startsWith("http") ? (
    <a href={href} className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}

/* Page ----------------------------------------------------------------------------------------------------------- */

export default function Home() {
  return (
    <div className="overflow-x-clip">
      {/* Hero */}
      <section className="on-dark relative isolate overflow-hidden bg-ink text-white">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(40%_50%_at_12%_20%,rgba(255,107,20,0.22),transparent_70%),radial-gradient(40%_50%_at_88%_30%,rgba(127,92,255,0.25),transparent_70%),radial-gradient(50%_40%_at_50%_100%,rgba(20,171,100,0.16),transparent_70%)]"
        />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(70%_60%_at_50%_30%,black,transparent)]" />
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20">
          <div className="mx-auto max-w-4xl space-y-8 text-center">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-sm text-stone-300 backdrop-blur hover:border-white/30 hover:text-white"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-musd-400 opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-musd-400" />
              </span>
              Live on Mezo testnet
              <span aria-hidden>→</span>
            </Link>
            <h1 className="display-1 [text-wrap:balance]">
              Checkout for <span className="text-signal-400">humans</span> and <span className="text-agent-300">AI&nbsp;agents</span>.
            </h1>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-stone-300 sm:text-xl">
              People pay with Bitcoin, MUSD or MEZO, or borrow against their BTC. Agents pay through an MCP server or an
              HTTP 402 paywall. Either way, you receive exact MUSD, settled on Mezo without custody or admin keys.
            </p>
            <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Link href="/dashboard" className="pill-signal">
                Start accepting payments <span aria-hidden>→</span>
              </Link>
              <Link href="/docs" className="pill-outline-dark">
                Read the docs
              </Link>
            </div>
            <p className="text-sm text-stone-500">Sign up with a passkey. No wallet, seed phrase or gas. Testnet only.</p>
          </div>

          <div className="mx-auto mt-14 max-w-6xl rounded-4xl border border-white/10 bg-white/[0.03] p-3 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)] backdrop-blur-sm sm:mt-20 sm:p-6 lg:p-8">
            <CheckoutDuo />
          </div>
        </div>
      </section>

      {/* Facts */}
      <Section className="py-16 sm:py-20">
        <dl className="reveal grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
          {facts.map((f) => (
            <div key={f.value} className="space-y-3 border-l-2 border-stone-200 pl-5">
              <dt className="sr-only">{f.label}</dt>
              <dd className="text-5xl font-semibold tracking-[-0.05em] sm:text-6xl">{f.value}</dd>
              <dd className="max-w-[16rem] text-sm leading-relaxed text-stone-600">{f.label}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-16 border-t border-stone-200 pt-8">
          <p className="mb-5 text-center text-sm text-stone-500">Built on Mezo, with open standards</p>
          <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
            {builtOn.map((b) => (
              <li key={b} className="text-lg font-semibold tracking-tight text-stone-400">
                {b}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Two kinds of customer */}
      <Section tone="canvas" className="py-20 sm:py-28">
        <Heading
          center
          eyebrow="Two kinds of customer"
          title="One checkout for people and the software they send."
          body="Shoppers pay from a wallet in a few taps. Agents pay from code, within limits you set. Both settle through the same verified contract, so your books show one thing: MUSD."
        />
        <div className="mt-14 grid gap-4 lg:grid-cols-2">
          <article className="reveal flex flex-col overflow-hidden rounded-4xl border border-stone-200 bg-white shadow-card">
            <div className="space-y-5 p-7 sm:p-10">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-signal-500 text-ink">
                <Icon name="person" />
              </span>
              <Eyebrow tone="signal">For people</Eyebrow>
              <h3 className="display-3">Spend Bitcoin without selling it.</h3>
              <p className="text-stone-600">
                A clean hosted checkout: choose MUSD, BTC or MEZO, or borrow MUSD against BTC, and confirm once. EVM wallets
                pay no gas; Bitcoin wallets connect through Mezo Passport.
              </p>
              <ArrowLink href="#humans">See the checkout</ArrowLink>
            </div>
            <div aria-hidden className="mt-auto border-t border-stone-200 bg-canvas p-5 sm:p-8">
              <div className="mx-auto max-w-sm overflow-hidden rounded-xl border border-stone-200 bg-white text-sm shadow-card">
                {methods.map((m, i) => (
                  <div key={m.name} className={`flex items-center gap-3 px-4 py-3 ${i ? "border-t border-stone-200" : ""} ${i === 1 ? "bg-signal-50/70" : ""}`}>
                    <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${i === 1 ? "border-ink" : "border-stone-300"}`}>
                      {i === 1 && <span className="h-2 w-2 rounded-full bg-ink" />}
                    </span>
                    <span className={`h-2.5 w-2.5 rounded-full ${m.dot}`} />
                    <span className={i === 1 ? "font-medium" : "text-stone-600"}>{m.name}</span>
                  </div>
                ))}
                <div className="border-t border-stone-200 p-3">
                  <div className="rounded-lg bg-ink py-2.5 text-center font-medium text-white">Pay now</div>
                </div>
              </div>
            </div>
          </article>

          <article className="on-dark reveal flex flex-col overflow-hidden rounded-4xl bg-ink text-white shadow-card">
            <div className="space-y-5 p-7 sm:p-10">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-agent-500 text-white">
                <Icon name="bot" />
              </span>
              <Eyebrow tone="agent">For AI agents</Eyebrow>
              <h3 className="display-3">Let software pay its own way.</h3>
              <p className="text-stone-400">
                Give an agent the Mezout MCP server and it can pay invoices in MUSD, with no gas or wallet pop-ups. Put the
                402 paywall in front of an API and agents pay per request.
              </p>
              <ArrowLink href="#agents" dark>
                See agent payments
              </ArrowLink>
            </div>
            <div aria-hidden className="mt-auto border-t border-white/10 bg-white/[0.03] p-5 sm:p-8">
              <div className="mx-auto max-w-sm space-y-1.5 rounded-xl border border-white/10 bg-stone-900 p-4 font-mono text-[12.5px]">
                <p className="text-stone-300">GET /api/report</p>
                <p className="text-signal-300">← 402 Payment Required · 0.05 MUSD</p>
                <p className="text-stone-300">pay_invoice inv_7c1e…</p>
                <p className="font-semibold text-musd-300">← 200 OK</p>
              </div>
            </div>
          </article>
        </div>
      </Section>

      {/* Humans: the checkout */}
      <Section id="humans" className="grid items-center gap-14 py-20 sm:py-28 lg:grid-cols-[1fr_0.9fr]">
        <div className="space-y-8">
          <Heading
            eyebrow="Hosted checkout"
            eyebrowTone="signal"
            title="A checkout people already understand."
            body="Send a link, show a QR code, or redirect from your store. Customers connect a wallet, see only the options it can use, and confirm once."
          />
          <ul className="reveal overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {methods.map((m, i) => (
              <li key={m.name} className={`flex items-start gap-4 px-5 py-4 ${i ? "border-t border-stone-200" : ""}`}>
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${m.dot}`} />
                <span>
                  <span className="font-medium">{m.name}.</span> <span className="text-stone-600">{m.body}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="reveal flex flex-wrap gap-x-8 gap-y-3 text-sm text-stone-600">
            <span className="flex items-center gap-2">
              <Icon name="tick" className="h-4 w-4 text-musd-600" /> Gasless for EVM wallets
            </span>
            <span className="flex items-center gap-2">
              <Icon name="tick" className="h-4 w-4 text-musd-600" /> Bitcoin wallets via Mezo Passport
            </span>
            <span className="flex items-center gap-2">
              <Icon name="tick" className="h-4 w-4 text-musd-600" /> Never below 160% collateral
            </span>
          </div>
        </div>
        <div className="reveal relative mx-auto w-full max-w-[480px]">
          <div aria-hidden className="absolute -inset-6 -z-0 rounded-[3rem] bg-gradient-to-br from-signal-100 via-canvas to-musd-100" />
          <div className="relative rounded-4xl border border-stone-200 bg-white p-4 shadow-lift sm:p-6">
            <Motion
              src="/motion/07-checkout.svg"
              width={520}
              height={640}
              alt="The Mezout checkout for a 25.00 MUSD order: the customer picks Pay with BTC, signs one message with no network fee, and sees Payment complete."
            />
          </div>
        </div>
      </Section>

      {/* How it works */}
      <Section id="how" tone="canvas" className="py-20 sm:py-28">
        <div className="mb-12">
          <Heading center eyebrow="How it works" title="Every way to pay. One settlement." />
        </div>
        <Showcase />
      </Section>

      {/* AI agents */}
      <Section id="agents" tone="dark" className="relative py-20 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-end">
          <Heading
            dark
            eyebrow="For AI agents"
            eyebrowTone="agent"
            title={
              <>
                Agents are customers now. <span className="text-stone-500">Let them pay, within limits you set.</span>
              </>
            }
          />
          <p className="reveal text-lg leading-relaxed text-stone-400">
            An agent asks for something, gets told the price, pays in MUSD and gets it, in seconds and with the same
            guarantees as your human customers. It can’t be talked into paying anyone else: Mezo testnet only, Mezout’s own
            contracts only.
          </p>
        </div>

        <div className="reveal mt-14">
          <AgentFlow />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="reveal space-y-5 rounded-4xl border border-white/10 bg-white/[0.03] p-7 sm:p-8">
            <p className="eyebrow text-agent-300">MCP server</p>
            <h3 className="display-3">Tools any MCP client can call.</h3>
            <p className="text-stone-400">Claude, Cursor or any MCP client gets tools to take and make payments, with caps on every payment and every session.</p>
            <ul className="flex flex-wrap gap-2">
              {mcpTools.map((t) => (
                <li key={t} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs text-stone-200">
                  {t}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link href="/docs#ai-agents" className="pill-light">
                Set up the MCP server
              </Link>
            </div>
          </div>
          <div className="reveal min-w-0 space-y-5 rounded-4xl border border-white/10 bg-white/[0.03] p-7 sm:p-8">
            <p className="eyebrow text-agent-300">HTTP 402 paywall</p>
            <h3 className="display-3">Charge per request in one wrapper.</h3>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-stone-900">
              <div className="border-b border-white/10 px-4 py-2.5 font-mono text-xs text-stone-500">app/api/report/route.ts</div>
              <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-stone-300">
                <code>
                  <span className="text-stone-500">{"// Charge agents 0.05 MUSD per request"}</span>
                  {"\n"}
                  <span className="text-agent-300">import</span> {"{ withMezout402 }"} <span className="text-agent-300">from</span>{" "}
                  <span className="text-musd-300">&quot;@mezout/paywall/next&quot;</span>;{"\n\n"}
                  <span className="text-agent-300">export const</span> GET = withMezout402({"\n"}
                  {"  { apiKey: process.env.MEZOUT_API_KEY, price: "}
                  <span className="text-musd-300">&quot;0.05&quot;</span>
                  {" },\n"}
                  {"  async (req, ctx, payment) => Response.json({ report, paidBy: payment.payer }),\n"});
                </code>
              </pre>
            </div>
            <a href={`${REPO}/tree/main/packages/paywall`} className="pill-outline-dark">
              HTTP 402 paywall on GitHub
            </a>
          </div>
        </div>
      </Section>

      {/* Merchants: guarantees */}
      <Section id="merchants" className="py-20 sm:py-28">
        <Heading
          eyebrow="For merchants"
          eyebrowTone="signal"
          title={
            <>
              You always receive exact MUSD. <span className="text-stone-400">Enforced by the contract.</span>
            </>
          }
        />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {guarantees.map((g) => (
            <div key={g.title} className="reveal space-y-4 rounded-3xl border border-stone-200 bg-white p-7 transition-colors hover:border-stone-300">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-canvas text-ink">
                <Icon name={g.icon} />
              </span>
              <h3 className="text-lg font-semibold tracking-tight">{g.title}</h3>
              <p className="text-[15px] leading-relaxed text-stone-600">{g.body}</p>
            </div>
          ))}
        </div>
        <div className="reveal mt-4 flex flex-col justify-between gap-6 rounded-3xl bg-canvas p-7 sm:flex-row sm:items-center sm:p-8">
          <div className="space-y-1">
            <p className="text-lg font-semibold tracking-tight">No wallet needed to get paid.</p>
            <p className="text-stone-600">Sign up with a passkey and get a payout account only your passkey controls, with gasless withdrawals.</p>
          </div>
          <Link href="/dashboard" className="pill-ink shrink-0">
            Create an account
          </Link>
        </div>
      </Section>

      {/* Developers */}
      <Section id="developers" tone="canvas" className="py-20 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-8">
            <Heading
              eyebrow="For developers"
              title="Plugs into how you already sell."
              body="Create an invoice from your server, send the customer to its checkout link, and fulfil the order when the signed webhook arrives. Or install a plugin and skip the code."
            />
            <div className="reveal flex flex-wrap gap-3">
              <Link href="/docs" className="pill-ink">
                Read the docs
              </Link>
              <a href={REPO} className="pill-outline">
                View on GitHub
              </a>
            </div>
          </div>
          <div className="reveal min-w-0 self-start overflow-hidden rounded-3xl bg-ink shadow-lift">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs text-stone-500">
              <span className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              </span>
              <span className="font-mono">Create an invoice</span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-stone-300">
              <code>
                <span className="text-stone-500">$</span> curl https://usemezout.vercel.app/v1/invoices \{"\n"}
                {"    "}-H <span className="text-musd-300">&quot;Authorization: Bearer mzk_test_…&quot;</span> \{"\n"}
                {"    "}-H <span className="text-musd-300">&quot;Content-Type: application/json&quot;</span> \{"\n"}
                {"    "}-H <span className="text-musd-300">&quot;Idempotency-Key: order-1001&quot;</span> \{"\n"}
                {"    "}-d <span className="text-musd-300">&apos;{`{"amount": "25.00", "reference": "Order 1001"}`}&apos;</span>
                {"\n\n"}
                <span className="font-semibold text-musd-400">201 Created</span>
                {"\n"}
                {`{ "id": "inv_3bf9a158b706b1412e77528f", "status": "pending",`}
                {"\n"}
                {`  "checkout_url": "https://usemezout.vercel.app/pay/eyJtIjoi…" }`}
              </code>
            </pre>
          </div>
        </div>
        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map((i) => {
            const external = i.href.startsWith("http");
            const body = (
              <>
                <span className="flex items-center justify-between">
                  <span className="eyebrow text-stone-500">{i.tag}</span>
                  <span aria-hidden className="text-stone-400 transition-transform group-hover:translate-x-0.5 group-hover:text-ink">
                    →
                  </span>
                </span>
                <span className="block text-lg font-semibold tracking-tight">{i.name}</span>
                <span className="block text-[15px] leading-relaxed text-stone-600">{i.body}</span>
              </>
            );
            const cls = "group flex h-full flex-col gap-3 rounded-3xl border border-stone-200 bg-white p-6 transition-all hover:-translate-y-0.5 hover:shadow-lift";
            return (
              <li key={i.name} className="reveal">
                {external ? (
                  <a href={i.href} className={cls}>
                    {body}
                  </a>
                ) : (
                  <Link href={i.href} className={cls}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      {/* Open and verifiable */}
      <Section id="contracts" className="py-20 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <Heading
            eyebrow="Open and verifiable"
            title="Check every claim yourself."
            body="The code is open source and the contracts are verified on Sourcify, so you can read exactly what runs. Mezout is on Mezo testnet, with test tokens only."
          />
          <div className="reveal space-y-4">
            <ul className="divide-y divide-stone-200 overflow-hidden rounded-3xl border border-stone-200 bg-white">
              {contracts.map((c) => (
                <li key={c.address} className="space-y-2 p-6">
                  <p className="flex items-center justify-between gap-3 font-semibold tracking-tight">
                    {c.name}
                    <a href={`${SOURCIFY}/${c.address}`} className="rounded-full bg-musd-50 px-2.5 py-1 text-xs font-medium text-musd-800 ring-1 ring-inset ring-musd-200 hover:bg-musd-100">
                      Verified source
                    </a>
                  </p>
                  <a href={`${EXPLORER}/${c.address}`} className="block break-all font-mono text-xs text-stone-600 underline decoration-stone-300 underline-offset-2 hover:text-ink">
                    {c.address}
                  </a>
                </li>
              ))}
            </ul>
            <ArrowLink href={REPO}>Code on GitHub</ArrowLink>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section tone="canvas" className="grid gap-10 py-20 sm:py-28 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="space-y-5">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="display-2">Questions</h2>
          <p className="text-stone-600">
            Something else? The{" "}
            <Link href="/docs" className="font-medium text-ink underline decoration-signal-400 decoration-2 underline-offset-2">
              API reference
            </Link>{" "}
            covers the details.
          </p>
        </div>
        <div className="divide-y divide-stone-200 overflow-hidden rounded-3xl border border-stone-200 bg-white">
          {faqs.map((f, i) => (
            <details key={f.q} className="group" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-[17px] font-medium tracking-tight hover:bg-stone-50 [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-stone-200 text-stone-500 transition-transform group-open:rotate-45">
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M10 4v12M4 10h12" strokeLinecap="round" />
                  </svg>
                </span>
              </summary>
              <p className="px-6 pb-6 leading-relaxed text-stone-600">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* Closing call to action */}
      <section className="on-dark relative isolate overflow-hidden bg-ink text-white">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(45%_70%_at_20%_100%,rgba(255,107,20,0.25),transparent_70%),radial-gradient(45%_70%_at_80%_0%,rgba(127,92,255,0.25),transparent_70%)]"
        />
        <div className="mx-auto max-w-4xl space-y-8 px-4 py-24 text-center sm:px-6 sm:py-32">
          <h2 className="display-1 [text-wrap:balance]">Ready for both kinds of customer?</h2>
          <p className="mx-auto max-w-xl text-lg text-stone-400">
            Create a merchant account with a passkey, share your first payment link or put a price on your API, and get
            paid in MUSD.
          </p>
          <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link href="/dashboard" className="pill-signal">
              Get started <span aria-hidden>→</span>
            </Link>
            <Link href="/docs" className="pill-outline-dark">
              Read the docs
            </Link>
          </div>
          <p className="text-sm text-stone-500">No wallet, no seed phrase, no gas. Testnet only.</p>
        </div>
      </section>
    </div>
  );
}
