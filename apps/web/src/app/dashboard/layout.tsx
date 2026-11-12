import Link from "next/link";
import type { Metadata } from "next";
import { MerchantArea } from "@/components/dashboard/merchant-area";
import { Wordmark } from "@/components/site/Logo";
import { ExternalLink } from "@/components/ui";
import { ClientProviders } from "../client-providers";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

const topLink = "inline-flex min-h-[40px] items-center rounded-lg px-3 text-stone-300 hover:bg-white/10 hover:text-white";

// Wallet providers (Mezo Passport, wagmi) load only on routes that need a wallet, so the landing page renders as HTML.
// MerchantArea signs the merchant in and wraps every dashboard tab. The dashboard draws its own admin frame: a dark
// top bar here, and the sidebar in DashboardShell. Links that leave the dashboard open in a new tab.
export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col bg-canvas">
      <header className="on-dark sticky top-0 z-40 bg-ink text-white">
        <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-5">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="Mezout home" className="rounded-lg">
              <Wordmark dark />
            </Link>
            <span aria-hidden className="hidden h-5 w-px bg-white/15 sm:block" />
            <span className="hidden text-sm text-stone-400 sm:block">Dashboard</span>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <ExternalLink href="/guides" className={`${topLink} hidden sm:inline-flex`}>
              Guides
            </ExternalLink>
            <ExternalLink href="/docs" className={topLink}>
              Docs
            </ExternalLink>
          </div>
        </div>
      </header>
      <ClientProviders>
        <MerchantArea>{children}</MerchantArea>
      </ClientProviders>
    </div>
  );
}
