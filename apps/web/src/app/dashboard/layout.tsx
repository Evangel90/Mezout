import type { Metadata } from "next";
import { MerchantArea } from "@/components/dashboard/merchant-area";
import { Container } from "@/components/site/Container";
import { ClientProviders } from "../client-providers";

export const metadata: Metadata = { title: "Dashboard" };

// Wallet providers (Mezo Passport, wagmi) load only on routes that need a wallet, so the landing page renders as HTML.
// MerchantArea signs the merchant in and wraps every dashboard tab.
export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClientProviders>
      <Container>
        <MerchantArea>{children}</MerchantArea>
      </Container>
    </ClientProviders>
  );
}
