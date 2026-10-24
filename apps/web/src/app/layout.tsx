import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";
import { ClientProviders } from "./client-providers";

const geistSans = localFont({ src: "./fonts/GeistVF.woff", variable: "--font-geist-sans", weight: "100 900" });
const geistMono = localFont({ src: "./fonts/GeistMonoVF.woff", variable: "--font-geist-mono", weight: "100 900" });

export const metadata: Metadata = {
  title: "Mezout",
  description: "Accept Bitcoin-backed payments and settle in MUSD on Mezo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-stone-50 text-stone-900 antialiased`}>
        <ClientProviders>
          <header className="border-b border-stone-200 bg-white">
            <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
              <Link href="/" className="font-semibold tracking-tight">
                Mezout
              </Link>
              <div className="flex items-center gap-4 text-sm">
                <Link href="/dashboard" className="text-stone-600 hover:text-stone-900">
                  Dashboard
                </Link>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Mezo testnet</span>
              </div>
            </nav>
          </header>
          <main className="mx-auto max-w-3xl px-4 py-10">{children}</main>
        </ClientProviders>
      </body>
    </html>
  );
}
