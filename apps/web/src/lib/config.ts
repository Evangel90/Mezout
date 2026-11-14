import { getAddress, type Address } from "viem";
import { network } from "./network";

export const routerAddress: Address = getAddress(
  process.env.NEXT_PUBLIC_ROUTER_ADDRESS ?? "0x0000000000000000000000000000000000000000",
);

export const txUrl = (hash: string) => `${network.explorerUrl}/tx/${hash}`;
