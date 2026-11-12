import { ClientProviders } from "../client-providers";

// Wallet providers (Mezo Passport, wagmi) load only on routes that need a wallet, so the landing page renders as HTML.
// Checkout lays out its own full-width, two-column page.
export default function WalletLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClientProviders>
      {children}
    </ClientProviders>
  );
}
