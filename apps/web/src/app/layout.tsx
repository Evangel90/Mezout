import type { Metadata } from "next";
import localFont from "next/font/local";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import "./globals.css";

const geistSans = localFont({ src: "./fonts/GeistVF.woff", variable: "--font-geist-sans", weight: "100 900" });
const geistMono = localFont({ src: "./fonts/GeistMonoVF.woff", variable: "--font-geist-mono", weight: "100 900" });

const description =
  "Checkout for Mezo. Customers pay with MUSD, BTC or MEZO, or borrow against their Bitcoin; merchants are paid in MUSD with the fee shown up front.";

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
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
