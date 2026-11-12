import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButtons } from "@/components/docs/CopyButtons";
import { readRepoFile, renderMarkdown } from "@/lib/markdown";
import { GuidesSidebar } from "../GuidesSidebar";
import { GUIDES, findGuide, sourceUrl } from "../guides";

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const guide = findGuide(params.slug);
  return guide ? { title: `${guide.title} guide`, description: guide.summary } : {};
}

export default function GuidePage({ params }: { params: { slug: string } }) {
  const guide = findGuide(params.slug);
  if (!guide) notFound();
  const file = `src/content/guides/${guide.slug}.md`;
  const { html, toc } = renderMarkdown(readRepoFile(file, `apps/web/${file}`));
  const index = GUIDES.findIndex((g) => g.slug === guide.slug);
  const prev = GUIDES[index - 1];
  const next = GUIDES[index + 1];
  const sections = toc.filter((h) => h.depth === 2);

  return (
    <div>
      <header className="border-b border-stone-200 bg-canvas">
        <div className="mx-auto max-w-7xl space-y-4 px-4 py-10 sm:px-6 sm:py-14">
          <nav aria-label="Breadcrumb" className="text-sm text-stone-500">
            <Link href="/guides" className="hover:text-ink hover:underline">
              Guides
            </Link>
            <span aria-hidden className="mx-2">
              /
            </span>
            <span>{guide.group}</span>
          </nav>
          <h1 className="display-2">{guide.title}</h1>
          <p className="max-w-2xl text-lg leading-relaxed text-stone-600">{guide.summary}</p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)_12rem] lg:gap-12">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <GuidesSidebar current={guide.slug} />
          </div>
        </aside>

        <div className="min-w-0 max-w-3xl space-y-10">
          <details className="rounded-2xl border border-stone-200 bg-white p-4 lg:hidden">
            <summary className="cursor-pointer text-sm font-medium">All guides</summary>
            <div className="mt-4">
              <GuidesSidebar current={guide.slug} />
            </div>
          </details>

          <article id="guide" className="api-doc">
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </article>
          <CopyButtons containerId="guide" />

          <nav aria-label="More guides" className="grid gap-3 border-t border-stone-200 pt-8 sm:grid-cols-2">
            {prev ? (
              <Link href={`/guides/${prev.slug}`} className="group rounded-2xl border border-stone-200 bg-white p-5 transition-colors hover:border-stone-300">
                <span className="block text-sm text-stone-500">← Previous</span>
                <span className="block font-semibold tracking-tight text-ink">{prev.title}</span>
              </Link>
            ) : (
              <span className="hidden sm:block" />
            )}
            {next ? (
              <Link href={`/guides/${next.slug}`} className="group rounded-2xl border border-stone-200 bg-white p-5 text-right transition-colors hover:border-stone-300">
                <span className="block text-sm text-stone-500">Next →</span>
                <span className="block font-semibold tracking-tight text-ink">{next.title}</span>
              </Link>
            ) : (
              <Link href="/docs" className="group rounded-2xl border border-stone-200 bg-white p-5 text-right transition-colors hover:border-stone-300">
                <span className="block text-sm text-stone-500">Next →</span>
                <span className="block font-semibold tracking-tight text-ink">API reference</span>
              </Link>
            )}
          </nav>
          <a
            href={sourceUrl(guide)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-ink lg:hidden"
          >
            View source on GitHub
            <span aria-hidden>↗</span>
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-6 text-sm">
            {sections.length > 1 && (
              <nav aria-label="On this page">
                <p className="eyebrow mb-3 text-stone-500">On this page</p>
                <ul className="space-y-1.5">
                  {sections.map((h) => (
                    <li key={h.id}>
                      <a href={`#${h.id}`} className="text-stone-600 hover:text-ink">
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <a
              href={sourceUrl(guide)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-stone-500 hover:text-ink"
            >
              View source on GitHub
              <span aria-hidden>↗</span>
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
