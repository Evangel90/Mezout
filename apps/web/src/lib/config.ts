import { getAddress, type Address } from "viem";
import { mezoTestnet } from "@mezout/sdk";

export const routerAddress: Address = getAddress(
  process.env.NEXT_PUBLIC_ROUTER_ADDRESS ?? "0x0000000000000000000000000000000000000000",
);

export const txUrl = (hash: string) => `${mezoTestnet.blockExplorers.default.url}/tx/${hash}`;
