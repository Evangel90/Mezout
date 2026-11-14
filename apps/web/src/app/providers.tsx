"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { useState, type ReactNode } from "react";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { PassportProvider, getConfig, mezoMainnet, mezoTestnet } from "@mezo-org/passport";
import { mezoNetwork } from "@/lib/network";

const wagmiConfig = getConfig({
  appName: "Mezout",
  mezoNetwork,
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "mezout-local",
  ssr: true,
});

// The wallet buttons and modal in Mezout's own colours rather than RainbowKit's default blue.
const walletTheme = lightTheme({ accentColor: "#1c1917", accentColorForeground: "#ffffff", borderRadius: "medium", overlayBlur: "small" });

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider initialChain={mezoNetwork === "mainnet" ? mezoMainnet : mezoTestnet} theme={walletTheme}>
          <PassportProvider environment={mezoNetwork}>{children}</PassportProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
