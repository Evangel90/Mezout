import type { Metadata } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import { NavigationProgress } from "@/components/site/NavigationProgress";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import "./globals.css";

const geistSans = localFont({ src: "./fonts/GeistVF.woff", variable: "--font-geist-sans", weight: "100 900" });
const geistMono = localFont({ src: "./fonts/GeistMonoVF.woff", variable: "--font-geist-mono", weight: "100 900" });

const description =
  "Checkout for humans and AI agents on Mezo. People pay with MUSD, BTC or MEZO, or borrow against their Bitcoin; agents pay through an MCP server or an HTTP 402 paywall; merchants receive exact MUSD.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000",
  ),
  title: { default: "Mezout · Checkout for humans and AI agents", template: "%s · Mezout" },
  description,
  openGraph: { siteName: "Mezout", title: "Mezout · Checkout for humans and AI agents", description, type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Hide landing page reveal blocks before first paint (ScrollReveal shows them). Skipped with reduced motion;
            if the page script never runs, everything is shown after 2.5 s. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(matchMedia("(prefers-reduced-motion: reduce)").matches||!("IntersectionObserver" in window))return;var r=document.documentElement;r.classList.add("js-reveal");setTimeout(function(){if(!r.dataset.revealReady)r.classList.remove("js-reveal")},2500)}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col bg-white text-ink antialiased`}
      >
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lift"
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
