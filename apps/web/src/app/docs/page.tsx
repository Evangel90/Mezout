import type { Metadata } from "next";
import Link from "next/link";
import { CopyButtons } from "@/components/docs/CopyButtons";
import { readRepoFile, renderMarkdown } from "@/lib/markdown";

export const metadata: Metadata = {
  title: "API reference",
  description: "Create invoices, follow payments and refunds, and receive signed webhooks from Mezout on Mezo testnet.",
};

const REPO_DOC = "https://github.com/Evangel90/Mezout/blob/main/docs/API.md";

const START = [
  { href: "#quickstart", title: "Quickstart", body: "Your first payment link, paid, in five minutes." },
  { href: "#webhooks", title: "Webhooks", body: "Know the moment an order is paid." },
  { href: "#embedded-checkout", title: "Embedded checkout", body: "Open checkout in a pop-up on your site." },
  { href: "#ai-agents", title: "AI agents", body: "Let agents pay you, or charge them per request." },
];

/**
 * docs/API.md is the single source for the API reference: it is read and rendered when the site is built, so the
 * page and the file on GitHub never drift apart.
 */
function loadApiDoc() {
  // The page has its own title, so drop the file's.
  return renderMarkdown(readRepoFile("docs/API.md").replace(/^# .*\n/, ""));
}

export default function DocsPage() {
  const { html, toc } = loadApiDoc();
  return (
    <div>
      <header className="border-b border-stone-200 bg-canvas">
        <div className="mx-auto max-w-7xl space-y-8 px-4 py-12 sm:px-6 sm:py-16">
          <div className="max-w-3xl space-y-4">
            <p className="eyebrow text-signal-700">Developers</p>
            <h1 className="display-2">API reference</h1>
            <p className="text-lg leading-relaxed text-stone-600">
              Create payment links from your server and fulfil orders when a signed webhook arrives. Setting up a store? Start with the{" "}
              <Link href="/guides" className="font-medium text-ink underline decoration-signal-400 decoration-2 underline-offset-2 hover:decoration-signal-600">
                guides
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/developers" className="pill-ink px-5 py-2.5 text-sm">
              Get an API key
            </Link>
            <Link href="/guides" className="pill-outline px-5 py-2.5 text-sm">
              Browse guides
            </Link>
            <a href={REPO_DOC} target="_blank" rel="noopener noreferrer" className="pill-outline px-5 py-2.5 text-sm">
              View on GitHub<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {START.map((s) => (
              <li key={s.href}>
                <a
                  href={s.href}
                  className="group flex h-full flex-col gap-1.5 rounded-2xl border border-stone-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <span className="flex items-center justify-between font-semibold tracking-tight text-ink">
                    {s.title}
                    <span aria-hidden className="text-stone-400 transition-transform group-hover:translate-x-0.5 group-hover:text-ink">
                      →
                    </span>
                  </span>
                  <span className="text-sm text-stone-600">{s.body}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-6 text-sm">
            <p className="eyebrow mb-4 text-stone-500">On this page</p>
            <ul className="space-y-1 border-l border-stone-200">
              {toc.map((h) => (
                <li key={h.id} className={h.depth === 3 ? "pl-6" : "pt-2 first:pt-0"}>
                  <a
                    href={`#${h.id}`}
                    className={`-ml-px block border-l-2 border-transparent py-0.5 hover:border-signal-500 ${
                      h.depth === 3 ? "text-stone-500 hover:text-ink" : "pl-4 font-medium text-stone-800 hover:text-ink"
                    }`}
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <div className="min-w-0 max-w-3xl space-y-8">
          <details className="rounded-2xl border border-stone-200 bg-white p-4 lg:hidden">
            <summary className="cursor-pointer text-sm font-medium">On this page</summary>
            <ul className="mt-3 space-y-1.5 text-sm">
              {toc
                .filter((h) => h.depth === 2)
                .map((h) => (
                  <li key={h.id}>
                    <a href={`#${h.id}`} className="text-stone-700 hover:text-stone-900 hover:underline">
                      {h.text}
                    </a>
                  </li>
                ))}
            </ul>
          </details>
          <article id="api-doc" className="api-doc" dangerouslySetInnerHTML={{ __html: html }} />
          <CopyButtons containerId="api-doc" />
        </div>
      </div>
    </div>
  );
}
