import type { Metadata } from "next";
import { MerchantArea } from "@/components/dashboard/merchant-area";
import { ClientProviders } from "../client-providers";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

// Wallet providers (Mezo Passport, wagmi) load only on routes that need a wallet, so the landing page renders as HTML.
// MerchantArea signs the merchant in and wraps every dashboard tab.
export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <ClientProviders>
        <MerchantArea>{children}</MerchantArea>
      </ClientProviders>
    </div>
  );
}
