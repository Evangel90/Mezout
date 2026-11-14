"use client";

import { useCallback, useEffect, useState } from "react";
import { createPublicClient, erc20Abi, http, type Address } from "viem";
import { addresses, network } from "@/lib/network";

const client = createPublicClient({ chain: network.chain, transport: http() });

/** The address's MUSD balance on the configured Mezo network, refreshed every 15 seconds. null until the first read. */
export function useMusdBalance(address: Address) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const refresh = useCallback(async () => {
    const value = await client
      .readContract({ address: addresses.musd, abi: erc20Abi, functionName: "balanceOf", args: [address] })
      .catch(() => null);
    if (value !== null) setBalance(value);
  }, [address]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  return { balance, refresh };
}
