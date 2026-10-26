import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { LogoMark } from "@/components/site/Logo";
import { SiteNav } from "@/components/site/SiteNav";
import "./globals.css";

const geistSans = localFont({ src: "./fonts/GeistVF.woff", variable: "--font-geist-sans", weight: "100 900" });
const geistMono = localFont({ src: "./fonts/GeistMonoVF.woff", variable: "--font-geist-mono", weight: "100 900" });

const REPO = "https://github.com/Evangel90/Mezout";
const description =
  "Merchant checkout on Mezo: customers pay with MUSD, BTC or MEZO, or borrow against BTC, and merchants receive the exact amount in MUSD.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000",
  ),
  title: { default: "Mezout · Merchant checkout on Mezo", template: "%s · Mezout" },
  description,
  openGraph: { siteName: "Mezout", title: "Mezout · Merchant checkout on Mezo", description, type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col bg-stone-50 text-stone-900 antialiased`}
      >
        <header className="border-b border-stone-200 bg-white">
          <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <LogoMark className="h-6 w-6 text-stone-900" />
              Mezout
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <SiteNav />
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Testnet</span>
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
        <footer className="border-t border-stone-200 bg-white">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-stone-600 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-sm space-y-1">
              <p className="flex items-center gap-2 font-medium text-stone-900">
                <LogoMark className="h-5 w-5 text-stone-900" /> Mezout
              </p>
              <p className="text-xs">
                Runs on Mezo testnet. Balances and payments use test tokens with no real value. Mezout never holds
                merchant or customer funds.
              </p>
            </div>
            <ul className="grid grid-cols-2 gap-x-8 gap-y-1">
              <li>
                <Link href="/docs" className="hover:text-stone-900">
                  API reference
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-stone-900">
                  Dashboard
                </Link>
              </li>
              <li>
                <a href={REPO} className="hover:text-stone-900">
                  Source code
                </a>
              </li>
              <li>
                <a href="/#contracts" className="hover:text-stone-900">
                  Contracts
                </a>
              </li>
            </ul>
          </div>
        </footer>
      </body>
    </html>
  );
}
