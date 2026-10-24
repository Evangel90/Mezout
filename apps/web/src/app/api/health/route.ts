import { NextResponse } from "next/server";
import { formatEther } from "viem";
import { publicClient, relayerClient } from "@/lib/server/clients";
import { serverEnv } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const client = publicClient();
  const relayer = relayerClient().account.address;
  const [chainId, balance, block] = await Promise.all([
    client.getChainId(),
    client.getBalance({ address: relayer }),
    client.getBlockNumber(),
  ]);
  return NextResponse.json({
    chainId,
    block: block.toString(),
    router: serverEnv.router(),
    relayer,
    relayerBalanceBTC: formatEther(balance),
  });
}
