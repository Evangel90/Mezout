import { keccak256, toHex, type Address, type Hex } from "viem";
import { MAX_BLOCK_RANGE, type ChainReader } from "@/lib/server/indexer";

export const ROUTER_V1: Address = "0xAF79AB1cdB38c0C3944bB9440614B58871Ba6199";
export const ROUTER_V2: Address = "0xe132f9a1c8dbc31015C3Cf4eE8706c9031bFa431";
export const BTC: Address = "0x7b7C000000000000000000000000000000000000";
const MUSD: Address = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";
export const GENESIS_TIME = 1_761_300_000; // block 0's timestamp in this fake chain; one block every 2 seconds

type PaidArgs = {
  orderId: Hex;
  merchant: Address;
  payer: Address;
  amount: bigint;
  fee?: bigint;
  method?: number;
  assetIn?: Address;
  amountIn?: bigint;
  borrowed?: bigint;
};

/** An in-memory chain of Paid logs, shaped like viem's decoded getLogs results. */
export class FakeChain implements ChainReader {
  head: bigint;
  logs: Array<{
    address: Address;
    blockNumber: bigint;
    transactionHash: Hex;
    logIndex: number;
    args: Required<PaidArgs>;
  }> = [];
  ranges: Array<[bigint, bigint]> = [];

  constructor(head: bigint) {
    this.head = head;
  }

  blockTime(n: bigint): number {
    return GENESIS_TIME + Number(n) * 2;
  }

  pay(router: Address, blockNumber: bigint, args: PaidArgs): Hex {
    const transactionHash = keccak256(toHex(`${router}:${blockNumber}:${this.logs.length}`));
    this.logs.push({
      address: router,
      blockNumber,
      transactionHash,
      logIndex: 0,
      args: { fee: 0n, method: 0, assetIn: MUSD, amountIn: args.amount, borrowed: 0n, ...args },
    });
    return transactionHash;
  }

  getBlockNumber = (async () => this.head) as ChainReader["getBlockNumber"];

  getBlock = (async ({ blockNumber }: { blockNumber: bigint }) => ({
    number: blockNumber,
    timestamp: BigInt(this.blockTime(blockNumber)),
  })) as unknown as ChainReader["getBlock"];

  getLogs = (async ({ address, fromBlock, toBlock }: { address: Address[]; fromBlock: bigint; toBlock: bigint }) => {
    if (toBlock - fromBlock > MAX_BLOCK_RANGE) throw new Error("maximum [from, to] blocks distance: 10000");
    this.ranges.push([fromBlock, toBlock]);
    const routers = address.map((a) => a.toLowerCase());
    return this.logs
      .filter((l) => routers.includes(l.address.toLowerCase()) && l.blockNumber >= fromBlock && l.blockNumber <= toBlock)
      .map((l) => ({ ...l, eventName: "Paid" }));
  }) as unknown as ChainReader["getLogs"];
}
