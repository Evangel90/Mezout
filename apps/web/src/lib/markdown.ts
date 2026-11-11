import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Marked, type Tokens } from "marked";

const LANGUAGE_LABEL: Record<string, string> = {
  bash: "Terminal",
  json: "JSON",
  js: "JavaScript",
  ts: "TypeScript",
  tsx: "React",
  html: "HTML",
  toml: "TOML",
  yaml: "YAML",
  php: "PHP",
  python: "Python",
  text: "",
};

const SITE = "https://usemezout.vercel.app";

const escapeHtml =(s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** GitHub's heading anchors, so links like /docs#webhooks match the same doc on GitHub. */
export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

export type TocEntry = { id: string; text: string; depth: number };

/**
 * Renders the site's Markdown (the API reference and the guides) with heading anchors, a table of contents, and code
 * blocks that carry a label and a copy button (wired up in the browser by CopyButtons). Links that leave the site
 * open in a new tab.
 */
export function renderMarkdown(markdown: string) {
  const toc: TocEntry[] = [];
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth, text }: Tokens.Heading) {
        const id = slug(text);
        if (depth <= 3) toc.push({ id, text, depth });
        return `<h${depth} id="${id}"><a href="#${id}">${this.parser.parseInline(tokens)}</a></h${depth}>\n`;
      },
      code({ text, lang }: Tokens.Code) {
        const label = LANGUAGE_LABEL[lang ?? ""] ?? "";
        return `<div class="code-block"><div class="code-block-bar"><span>${label}</span><button type="button" data-copy>Copy</button></div><pre><code>${escapeHtml(text)}</code></pre></div>\n`;
      },
      link({ href: raw, title, tokens }: Tokens.Link) {
        const inner = this.parser.parseInline(tokens);
        const t = title ? ` title="${escapeHtml(title)}"` : "";
        // Links to Mezout's own site are absolute in the Markdown so they also work on GitHub; on the site they stay local.
        const href = raw.startsWith(`${SITE}/`) ? raw.slice(SITE.length) : raw;
        if (/^https?:\/\//.test(href)) {
          return `<a href="${escapeHtml(href)}"${t} target="_blank" rel="noopener noreferrer">${inner}<span class="sr-only"> (opens in a new tab)</span></a>`;
        }
        return `<a href="${escapeHtml(href)}"${t}>${inner}</a>`;
      },
    },
  });
  const html = marked.parse(markdown, { async: false });
  return { html, toc };
}

/** Reads a file under the repo, whether the build runs from the repo root or from apps/web. */
export function readRepoFile(...candidates: string[]) {
  const file = candidates.flatMap((c) => [path.join(process.cwd(), c), path.join(process.cwd(), "../..", c)]).find(existsSync);
  if (!file) throw new Error(`${candidates[0]} not found`);
  return readFileSync(file, "utf8");
}
