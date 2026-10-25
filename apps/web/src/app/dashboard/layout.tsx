import { MerchantArea } from "@/components/dashboard/merchant-area";
import { ClientProviders } from "../client-providers";

// Wallet providers (Mezo Passport, wagmi) load only on routes that need a wallet, so the landing page renders as HTML.
// MerchantArea signs the merchant in and wraps every dashboard tab.
export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClientProviders>
      <MerchantArea>{children}</MerchantArea>
    </ClientProviders>
  );
}
