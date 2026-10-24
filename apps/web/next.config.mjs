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
  transpilePackages: ["@mezout/sdk", "@mezo-org/passport", "@mezo-org/orangekit", "@mezo-org/orangekit-smart-account", "@mezo-org/orangekit-contracts"],
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
