import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { Marked, type Tokens } from "marked";
import { CopyButtons } from "@/components/docs/CopyButtons";

export const metadata: Metadata = {
  title: "API reference",
  description: "Create invoices, follow payments and refunds, and receive signed webhooks from Mezout on Mezo testnet.",
};

const REPO_DOC = "https://github.com/Evangel90/Mezout/blob/main/docs/API.md";

const LANGUAGE_LABEL: Record<string, string> = { bash: "Terminal", json: "JSON", js: "JavaScript", php: "PHP", python: "Python" };

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** GitHub's heading anchors, so links like /docs#webhooks match the same doc on GitHub. */
const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

/**
 * docs/API.md is the single source for the API reference: it is read and rendered when the site is built, so the
 * page and the file on GitHub never drift apart. The build runs from the repo root or from apps/web.
 */
function loadApiDoc() {
  const file = [path.join(process.cwd(), "docs/API.md"), path.join(process.cwd(), "../../docs/API.md")].find(existsSync);
  if (!file) throw new Error("docs/API.md not found");
  // The page has its own title, so drop the file's.
  const markdown = readFileSync(file, "utf8").replace(/^# .*\n/, "");

  const toc: { id: string; text: string; depth: number }[] = [];
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth, text }: Tokens.Heading) {
        const id = slug(text);
        if (depth <= 3) toc.push({ id, text, depth });
        return `<h${depth} id="${id}"><a href="#${id}">${this.parser.parseInline(tokens)}</a></h${depth}>\n`;
      },
      // Each code block gets a label and a copy button; CopyButtons wires up the buttons in the browser.
      code({ text, lang }: Tokens.Code) {
        const label = LANGUAGE_LABEL[lang ?? ""] ?? "";
        return `<div class="code-block"><div class="code-block-bar"><span>${label}</span><button type="button" data-copy>Copy</button></div><pre><code>${escapeHtml(text)}</code></pre></div>\n`;
      },
    },
  });
  const html = marked.parse(markdown, { async: false });
  return { html, toc };
}

export default function DocsPage() {
  const { html, toc } = loadApiDoc();
  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <p className="text-sm font-medium text-stone-500">Developers</p>
        <h1 className="text-3xl font-semibold tracking-tight">API reference</h1>
        <p className="max-w-2xl text-lg text-stone-600">
          Create invoices from your store, follow payments and refunds, and get signed webhooks when something happens.
          Everything runs on Mezo testnet with test MUSD.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard/developers" className="rounded-lg bg-stone-900 px-4 py-2 text-white hover:bg-stone-700">
            Get an API key
          </Link>
          <a href={REPO_DOC} className="rounded-lg border border-stone-300 bg-white px-4 py-2 hover:bg-stone-100">
            View on GitHub
          </a>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-6 text-sm">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">On this page</p>
            <ul className="space-y-1">
              {toc.map((h) => (
                <li key={h.id} className={h.depth === 3 ? "pl-3" : "pt-2 first:pt-0"}>
                  <a
                    href={`#${h.id}`}
                    className={h.depth === 3 ? "text-stone-500 hover:text-stone-900" : "font-medium text-stone-800 hover:text-stone-950"}
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <div className="min-w-0 space-y-8">
          <details className="rounded-xl border border-stone-200 bg-white p-4 lg:hidden">
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
