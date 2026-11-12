import Link from "next/link";
import type { ReactNode } from "react";
import { AgentFlow } from "@/components/site/motion/AgentFlow";
import { CheckoutDuo } from "@/components/site/motion/CheckoutDuo";
import { InteractiveBackdrop } from "@/components/site/motion/InteractiveBackdrop";
import { CommandLine } from "@/components/site/CommandLine";
import { ScrollReveal } from "@/components/site/ScrollReveal";
import { Showcase } from "@/components/site/Showcase";
import { AGENT_BRANDS, BrandRow, STORE_BRANDS, WorksWithStrip } from "@/components/site/WorksWith";

const REPO = "https://github.com/Evangel90/Mezout"; // Only for the explicit "View on GitHub" links.
const EXPLORER = "https://explorer.test.mezo.org/address";
const SOURCIFY = "https://repo.sourcify.dev/31611";

const contracts = [
  { name: "MezoutRouter", address: "0x7151473F1300c2529A2eEFaA517684e974A9b3E6" },
  { name: "MezoutAccountFactory", address: "0xeE85EE32488FF2D63eFe48159ddB59e6863cdF79" },
];

const builtOn = ["MUSD", "Mezo Passport", "Tigris", "Model Context Protocol", "x402", "Sourcify"];

const facts = [
  { value: "4", label: "ways customers can pay: MUSD, BTC, MEZO or a loan against BTC" },
  { value: "1%", label: "fee per payment, taken from your payout. Customers pay your price." },
  { value: "0", label: "funds Mezout holds. Payments go straight to you." },
  { value: "160%", label: "minimum collateral when a customer borrows to pay" },
];

const methods = [
  { dot: "bg-musd-500", name: "Pay with MUSD", body: "Straight from their balance." },
  { dot: "bg-[#f7931a]", name: "Pay with BTC", body: "Converted at a live price, capped at the price they approve." },
  { dot: "bg-rose-600", name: "Pay with MEZO", body: "Converted the same way, with the same cap." },
  { dot: "bg-signal-600", name: "Borrow against BTC", body: "They keep their Bitcoin and borrow the MUSD." },
];

const guarantees = [
  { icon: "equal", title: "The exact amount", body: "Customers pay your price. You see the fee and your payout before you share a link." },
  { icon: "arrow", title: "Your money, your account", body: "Payments go straight to you. Mezout never holds your funds or keys." },
  { icon: "check", title: "No one can change the rules", body: "No owner, no pause switch, no upgrades. The contract code is public and verified." },
  { icon: "shield", title: "Safe borrowing", body: "Checkout refuses any loan that would drop below 160% collateral." },
  { icon: "receipt", title: "Paid once, never twice", body: "Each payment link can be paid once. Each approval covers one link only." },
  { icon: "blocks", title: "Paid means confirmed", body: "An order counts as paid only once Mezo confirms it. Never on a browser’s word." },
];

const integrations = [
  { name: "Shopify app", body: "Adds a “Pay with Bitcoin or MUSD” option to your store.", href: "/guides/shopify", tag: "Stores" },
  { name: "WooCommerce plugin", body: "Adds Mezout to classic and block checkouts.", href: "/guides/woocommerce", tag: "Stores" },
  { name: "Embedded checkout", body: "Open checkout in a pop-up on your own site.", href: "/guides/embedded-checkout", tag: "Your site" },
  { name: "AI agents", body: "Let agents pay you, and charge them per request.", href: "/guides/ai-agents", tag: "Agents" },
  { name: "REST API", body: "Create payment links from any backend.", href: "/docs#quickstart", tag: "Developers" },
  { name: "Webhooks", body: "Know the moment an order is paid. Signed and retried for 24 hours.", href: "/docs#webhooks", tag: "Developers" },
];

const faqs = [
  {
    q: "What can my customers pay with?",
    a: "MUSD, BTC or MEZO, or MUSD borrowed against their Bitcoin. They only see what their wallet can use. You get MUSD every time.",
  },
  {
    q: "Do I need a crypto wallet?",
    a: "No. Sign up with a passkey: Face ID, Touch ID, Windows Hello or your phone. You get a payout account only you control, with free withdrawals. Already on Mezo? Get paid to your wallet instead.",
  },
  {
    q: "Does Mezout hold my money?",
    a: "Never. Each payment goes straight from the customer to you, in one transaction. Mezout has no way to move your funds.",
  },
  {
    q: "How do I know an order is paid?",
    a: "Your dashboard updates within seconds of Mezo confirming the payment. Your store also gets a signed notification (a webhook).",
  },
  {
    q: "What does it cost?",
    a: "1% per payment, taken from your payout. Customers pay your listed price. You see the fee before you share a link.",
  },
  {
    q: "Does it work with my store?",
    a: "Yes. Install the Shopify app or the WooCommerce plugin, embed checkout on your own site, or use the API. The guides walk you through each.",
  },
  {
    q: "How do AI agents pay me?",
    a: "Two ways. An agent with the Mezout MCP server can pay your payment links, within limits its owner sets. Or you put a price on your API and agents pay per request.",
  },
  {
    q: "Is it live on mainnet?",
    a: "Not yet. Mezout runs on Mezo testnet today. Mainnet comes after a security review and passkey account recovery.",
  },
];

/* Building blocks ------------------------------------------------------------------------------------------------ */

function Section({
  id,
  tone = "white",
  className = "",
  children,
  backdrop,
}: Readonly<{ id?: string; tone?: "white" | "canvas" | "dark"; className?: string; children: ReactNode; backdrop?: ReactNode }>) {
  const bg = { white: "bg-white", canvas: "bg-canvas", dark: "on-dark bg-ink text-white" }[tone];
  return (
    <section id={id} className={`${bg} relative isolate scroll-mt-16 overflow-hidden`}>
      {backdrop}
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
    <div className={`reveal-group max-w-3xl space-y-5 ${center ? "mx-auto text-center" : ""}`}>
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
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  ) : (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}

/**
 * A decorative photo behind a section: faint, softly desaturated and faded out toward the content, so it sets the
 * scene without competing with the text. `side` is where the photo shows most.
 */
function PhotoBackdrop({ src, side = "right", opacity = 0.14, position = "center" }: Readonly<{ src: string; side?: "left" | "right"; opacity?: number; position?: string }>) {
  const fade =
    side === "right"
      ? "linear-gradient(to left, black 0%, rgba(0,0,0,0.6) 35%, transparent 75%)"
      : "linear-gradient(to right, black 0%, rgba(0,0,0,0.6) 35%, transparent 75%)";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="photo-drift absolute inset-0 h-full w-full object-cover saturate-[0.6]"
        style={{ opacity, objectPosition: position, maskImage: fade, WebkitMaskImage: fade }}
      />
    </div>
  );
}

/* Page ----------------------------------------------------------------------------------------------------------- */

export default function Home() {
  return (
    <div className="overflow-x-clip">
      <ScrollReveal />
      {/* Hero */}
      <section id="hero" className="on-dark relative isolate -mt-[4.5rem] overflow-hidden bg-ink pt-[4.5rem] text-white">
        <InteractiveBackdrop />
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-16">
          <div className="mx-auto max-w-6xl space-y-7 text-center sm:space-y-9">
            <div aria-hidden className="h-8" />
            <h1 className="hero-in display-1 [text-wrap:balance] text-[3.1rem] sm:text-[5rem] lg:text-[6.5rem]" style={{ ["--d" as string]: "90ms" }}>
              Checkout for <span className="text-signal-400">humans</span> and <span className="text-agent-300">AI&nbsp;agents</span>.
            </h1>
            <p className="hero-in mx-auto max-w-3xl text-lg leading-relaxed text-stone-300 sm:text-2xl" style={{ ["--d" as string]: "180ms" }}>
              Customers pay with Bitcoin, MUSD or MEZO. AI agents pay over x402. You get the exact amount in MUSD, straight
              to your account.
            </p>
            <div style={{ ["--d" as string]: "270ms" }} className="hero-in flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Link href="/dashboard" className="pill-signal sm:px-8 sm:py-4 sm:text-base">
                Start selling <span aria-hidden>→</span>
              </Link>
              <Link href="/guides" className="pill-outline-dark sm:px-8 sm:py-4 sm:text-base">
                See the guides
              </Link>
            </div>
          </div>

          {/* The headline, acted out: a person and an agent pay at once, and both land as exact MUSD. */}
          <div className="hero-in mx-auto mt-14 max-w-6xl sm:mt-20" style={{ ["--d" as string]: "420ms" }}>
            <div className="rounded-4xl border border-white/10 bg-white/[0.03] p-3 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)] backdrop-blur-sm sm:p-6 lg:p-8">
              <CheckoutDuo />
            </div>
          </div>
        </div>
      </section>

      {/* Works with */}
      <section aria-label="Works with" className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <WorksWithStrip />
          <p className="mt-4 text-center text-xs text-stone-500">
            Compatibility, not partnership. Mezout makes its own Shopify app and WooCommerce plugin, and its MCP server runs in any agent that supports local MCP servers.
          </p>
        </div>
      </section>

      {/* Facts */}
      <Section className="py-16 sm:py-20">
        <dl className="reveal-group grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
          {facts.map((f) => (
            <div key={f.value} className="space-y-3 border-l-2 border-stone-200 pl-5">
              <dt className="sr-only">{f.label}</dt>
              <dd className="text-5xl font-semibold tracking-[-0.05em] sm:text-6xl">{f.value}</dd>
              <dd className="max-w-[16rem] text-sm leading-relaxed text-stone-600">{f.label}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-16 border-t border-stone-200 pt-8">
          <p className="mb-5 text-center text-sm text-stone-500">Built on Mezo and open standards</p>
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
          title="Sell to people and AI agents."
          body="Shoppers pay from a wallet in a few taps. Agents pay from code. Either way, you get MUSD."
        />
        <div className="mt-14 grid gap-4 lg:grid-cols-2">
          <article style={{ ["--i" as string]: 0 }} className="reveal flex flex-col overflow-hidden rounded-4xl border border-stone-200 bg-white shadow-card">
            <div className="space-y-5 p-7 sm:p-10">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-signal-500 text-ink">
                <Icon name="person" />
              </span>
              <Eyebrow tone="signal">Shoppers</Eyebrow>
              <h3 className="display-3">Accept Bitcoin at checkout.</h3>
              <p className="text-stone-600">
                Customers pay with MUSD, BTC or MEZO, or borrow against their BTC. One tap to confirm.
              </p>
              <BrandRow label="Plugs into" brands={STORE_BRANDS} />
              <ArrowLink href="#humans">See the checkout</ArrowLink>
            </div>
            <div aria-hidden className="flex flex-1 flex-col justify-center border-t border-stone-200 bg-canvas p-5 sm:p-8">
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

          <article style={{ ["--i" as string]: 1 }} className="on-dark reveal flex flex-col overflow-hidden rounded-4xl bg-ink text-white shadow-card">
            <div className="space-y-5 p-7 sm:p-10">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-agent-500 text-white">
                <Icon name="bot" />
              </span>
              <Eyebrow tone="agent">AI agents</Eyebrow>
              <h3 className="display-3">Get paid by software.</h3>
              <p className="text-stone-400">
                Agents pay over x402, the open standard for payments over HTTP. In MUSD, with no gas or pop-ups.
              </p>
              <BrandRow label="Runs in" brands={AGENT_BRANDS} dark />
              <ArrowLink href="#agents" dark>
                See agent payments
              </ArrowLink>
            </div>
            <div aria-hidden className="flex flex-1 flex-col justify-center border-t border-white/10 bg-white/[0.03] p-5 sm:p-8">
              <div className="mx-auto max-w-sm space-y-1.5 rounded-xl border border-white/10 bg-stone-900 p-4 font-mono text-[12.5px]">
                <p className="text-stone-500">task: buy the market report</p>
                <p className="text-stone-300">GET /api/report</p>
                <p className="text-signal-300">← 402 Payment Required · 0.05 MUSD</p>
                <p className="text-stone-300">pay_invoice inv_7c1e…</p>
                <p className="pl-4 text-musd-300">✓ under cap 1.00 MUSD / payment</p>
                <p className="text-stone-300">GET /api/report  PAYMENT-SIGNATURE</p>
                <p className="font-semibold text-musd-300">← 200 OK</p>
              </div>
            </div>
          </article>
        </div>
      </Section>

      {/* Humans: the checkout */}
      <Section id="humans" backdrop={<PhotoBackdrop src="/photos/merchant-card-reader.jpg" side="left" opacity={0.16} position="30% 50%" />} className="grid items-center gap-14 py-20 sm:py-28 lg:grid-cols-[1fr_0.9fr]">
        <div className="space-y-8">
          <Heading
            eyebrow="Hosted checkout"
            eyebrowTone="signal"
            title="A checkout shoppers get."
            body="Share a link or QR code, or send shoppers from your store. They see only the options their wallet can use."
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
              <Icon name="tick" className="h-4 w-4 text-musd-600" /> No gas for Ethereum-style wallets
            </span>
            <span className="flex items-center gap-2">
              <Icon name="tick" className="h-4 w-4 text-musd-600" /> Bitcoin wallets welcome
            </span>
            <span className="flex items-center gap-2">
              <Icon name="tick" className="h-4 w-4 text-musd-600" /> Loans stay above 160% collateral
            </span>
          </div>
        </div>
        <div className="reveal-scale relative mx-auto w-full max-w-[480px]">
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
          <Heading
            center
            eyebrow="How it works"
            title={
              <>
                <span className="block">Any way they pay.</span> <span className="block">One payout.</span>
              </>
            }
            body="MUSD, BTC, MEZO or a loan against Bitcoin. No gas for customers, no wallet needed for you."
          />
        </div>
        <div className="reveal-scale">
          <Showcase />
        </div>
      </Section>

      {/* AI agents */}
      <Section id="agents" tone="dark" className="py-20 sm:py-28" backdrop={<InteractiveBackdrop variant="agents" />}>
        <Heading
          center
          dark
          eyebrow="For AI agents"
          eyebrowTone="agent"
          title={
            <>
              Agents pay with x402. <span className="text-stone-500">You get MUSD.</span>
            </>
          }
          body="Give your agent a Mezout wallet with one command. It pays your links and x402 APIs in MUSD, within the limits you set."
        />

        {/* The one thing to do: the setup command. */}
        <div className="reveal-scale mx-auto mt-12 max-w-3xl">
          <div className="relative">
            <div aria-hidden className="absolute -inset-px rounded-[1.4rem] bg-gradient-to-r from-agent-500/60 via-agent-300/30 to-signal-500/50 blur-xl opacity-60" />
            <CommandLine command="npx -y @mezout/mcp init" size="lg" />
          </div>
          <p className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-stone-400">
            <span>Works in Claude, Cursor, Codex and Hermes Agent</span>
            <span aria-hidden className="hidden text-stone-600 sm:inline">·</span>
            <span>A cap on every payment</span>
            <span aria-hidden className="hidden text-stone-600 sm:inline">·</span>
            <ArrowLink href="/guides/ai-agents" dark>
              Setup guide
            </ArrowLink>
          </p>
        </div>

        <div className="reveal mt-16">
          <AgentFlow />
        </div>

        <div className="reveal mt-6 grid gap-8 rounded-4xl border border-white/10 bg-white/[0.03] p-7 sm:p-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div className="space-y-4">
            <p className="eyebrow text-agent-300">Selling to agents?</p>
            <h3 className="display-3">Price any API route.</h3>
            <p className="text-stone-400">Wrap a route and agents pay per request over x402. Unpaid calls get a 402 with the price.</p>
            <ArrowLink href="/guides/paywall" dark>
              Paywall guide
            </ArrowLink>
          </div>
          <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-stone-900">
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-stone-300">
              <code>
                <span className="text-agent-300">export const</span> GET = withMezout402({"\n"}
                {"  { apiKey, price: "}
                <span className="text-musd-300">&quot;0.05&quot;</span>
                {" },\n"}
                {"  () => Response.json(report),\n"});
              </code>
            </pre>
          </div>
        </div>
      </Section>

      {/* Merchants: guarantees */}
      <Section id="merchants" backdrop={<PhotoBackdrop src="/photos/merchant-pos.jpg" side="right" opacity={0.24} position="center 35%" />} className="py-20 sm:py-28">
        <Heading
          eyebrow="For merchants"
          eyebrowTone="signal"
          title={
            <>
              You get the exact amount. <span className="text-stone-400">The contract makes sure.</span>
            </>
          }
        />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {guarantees.map((g, i) => (
            <div key={g.title} style={{ ["--i" as string]: i % 3 }} className="reveal space-y-4 rounded-3xl border border-stone-200 bg-white p-7 transition-colors hover:border-stone-300">
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
            <p className="text-lg font-semibold tracking-tight">No wallet needed.</p>
            <p className="text-stone-600">Sign up with a passkey. Only you control your payout account. Withdrawals are free.</p>
          </div>
          <Link href="/dashboard" className="pill-ink shrink-0">
            Create an account
          </Link>
        </div>
      </Section>

      {/* Developers */}
      <Section id="developers" tone="canvas" backdrop={<PhotoBackdrop src="/photos/online-checkout.jpg" side="left" opacity={0.18} />} className="py-20 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-8">
            <Heading
              eyebrow="Integrations"
              title="Works with how you sell."
              body="Install the Shopify app or WooCommerce plugin, no code needed. Or create payment links from your own server."
            />
            <div className="reveal flex flex-wrap items-center gap-3">
              <Link href="/guides" className="pill-ink">
                Browse the guides
              </Link>
              <Link href="/docs" className="pill-outline">
                API reference
              </Link>
            </div>
            <div className="reveal">
              <ArrowLink href={REPO}>View on GitHub</ArrowLink>
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
          {integrations.map((i, n) => {
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
              <li key={i.name} className="reveal" style={{ ["--i" as string]: n % 3 }}>
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
            title="Don’t trust us. Check."
            body="The code is open source and the contracts are verified on Sourcify."
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
        <div className="reveal divide-y divide-stone-200 overflow-hidden rounded-3xl border border-stone-200 bg-white">
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
          className="absolute inset-0 -z-10 overflow-hidden"
        >
          <div className="ambient-a absolute -bottom-1/3 -left-[10%] h-[90%] w-[60%] bg-[radial-gradient(closest-side,rgba(255,107,20,0.28),transparent)]" />
          <div className="ambient-b absolute -right-[10%] -top-1/3 h-[90%] w-[60%] bg-[radial-gradient(closest-side,rgba(127,92,255,0.28),transparent)]" />
        </div>
        <div className="reveal-group mx-auto max-w-4xl space-y-8 px-4 py-24 text-center sm:px-6 sm:py-32">
          <h2 className="display-1 [text-wrap:balance]">Start getting paid.</h2>
          <p className="mx-auto max-w-xl text-lg text-stone-400">Sign up with a passkey and share your first payment link in minutes.</p>
          <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link href="/dashboard" className="pill-signal">
              Get started <span aria-hidden>→</span>
            </Link>
            <Link href="/guides" className="pill-outline-dark">
              See the guides
            </Link>
          </div>
          <p className="text-sm text-stone-500">No wallet. No seed phrase.</p>
        </div>
      </section>
    </div>
  );
}
