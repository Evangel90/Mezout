import Link from "next/link";
import { GUIDES } from "./guides";

const GROUPS = Array.from(new Set(GUIDES.map((g) => g.group)));

/** The list of guides, grouped, with the current one marked. A sticky column on large screens. */
export function GuidesSidebar({ current }: { current?: string }) {
  return (
    <nav aria-label="Guides" className="text-sm">
      <Link href="/guides" className={`mb-5 block font-semibold ${current ? "text-stone-500 hover:text-ink" : "text-ink"}`} aria-current={current ? undefined : "page"}>
        All guides
      </Link>
      <div className="space-y-6">
        {GROUPS.map((group) => (
          <div key={group}>
            <p className="eyebrow mb-2 text-stone-500">{group}</p>
            <ul className="space-y-1 border-l border-stone-200">
              {GUIDES.filter((g) => g.group === group).map((g) => {
                const active = g.slug === current;
                return (
                  <li key={g.slug}>
                    <Link
                      href={`/guides/${g.slug}`}
                      aria-current={active ? "page" : undefined}
                      className={`-ml-px block border-l-2 py-1 pl-4 ${active ? "border-signal-500 font-medium text-ink" : "border-transparent text-stone-600 hover:border-stone-300 hover:text-ink"}`}
                    >
                      {g.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <div>
          <p className="eyebrow mb-2 text-stone-500">Reference</p>
          <ul className="space-y-1 border-l border-stone-200">
            <li>
              <Link href="/docs" className="-ml-px block border-l-2 border-transparent py-1 pl-4 text-stone-600 hover:border-stone-300 hover:text-ink">
                API reference
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
}
