import { ClientProviders } from "../client-providers";

// Wallet providers (Mezo Passport, wagmi) load only on routes that need a wallet: a recovery wallet signs here.
export default function RecoverLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ClientProviders>{children}</ClientProviders>;
}
