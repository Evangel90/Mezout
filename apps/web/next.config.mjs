import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

// Secrets live in the repo-root .env.local, shared with Foundry scripts.
nextEnv.loadEnvConfig(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  process.env.NODE_ENV !== "production",
  undefined,
  true,
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // MEZO_NETWORK (testnet or mainnet, default testnet) is baked into the build so pages and API agree.
  env: { NEXT_PUBLIC_MEZO_NETWORK: process.env.MEZO_NETWORK || process.env.NEXT_PUBLIC_MEZO_NETWORK || "testnet" },
  // Runs src/instrumentation.ts at server start, which refuses a network with unverified addresses.
  experimental: { instrumentationHook: true },
  transpilePackages: ["@mezout/sdk", "@mezo-org/passport", "@mezo-org/orangekit", "@mezo-org/orangekit-smart-account", "@mezo-org/orangekit-contracts"],
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
