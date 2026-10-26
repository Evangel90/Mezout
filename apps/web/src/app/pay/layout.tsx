import { Container } from "@/components/site/Container";
import { ClientProviders } from "../client-providers";

// Wallet providers (Mezo Passport, wagmi) load only on routes that need a wallet, so the landing page renders as HTML.
export default function WalletLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClientProviders>
      <Container>{children}</Container>
    </ClientProviders>
  );
}
