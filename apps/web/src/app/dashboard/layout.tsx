import type { Metadata } from "next";
import Link from "next/link";
import { MerchantArea } from "@/components/dashboard/merchant-area";
import { Wordmark } from "@/components/site/Logo";
import { ClientProviders } from "../client-providers";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

// Wallet providers (Mezo Passport, wagmi) load only on routes that need a wallet, so the landing page renders as HTML.
// MerchantArea signs the merchant in and wraps every dashboard tab. The dashboard draws its own admin frame: a dark
// top bar here, and the sidebar in DashboardShell.
export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col bg-canvas">
      <header className="on-dark sticky top-0 z-40 bg-ink text-white">
        <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-5">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="Mezout home" className="rounded-lg">
              <Wordmark dark />
            </Link>
            <span aria-hidden className="hidden h-5 w-px bg-white/15 sm:block" />
            <span className="hidden text-sm text-stone-400 sm:block">Merchant dashboard</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-full bg-signal-500/15 px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-wider text-signal-300 ring-1 ring-inset ring-signal-500/30">
              Testnet
            </span>
            <Link href="/docs" className="rounded-lg px-3 py-1.5 text-stone-300 hover:bg-white/10 hover:text-white">
              Docs
            </Link>
          </div>
        </div>
      </header>
      <ClientProviders>
        <MerchantArea>{children}</MerchantArea>
      </ClientProviders>
    </div>
  );
}
