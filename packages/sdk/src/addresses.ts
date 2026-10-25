import type { Address } from "viem";

/** Mezo testnet (31611); confirmed in docs/M0-findings.md. */
export const mezoTestnetAddresses = {
  musd: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
  borrowerOperations: "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5",
  borrowerOperationsSignatures: "0xD757e3646AF370b15f32EB557F0F8380Df7D639e",
  troveManager: "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0",
  hintHelpers: "0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6",
  sortedTroves: "0x722E4D24FD6Ff8b0AC679450F3D91294607268fA",
  priceFeed: "0x86bCF0841622a5dAC14A313a15f96A95421b9366",
  btcToken: "0x7b7C000000000000000000000000000000000000",
  mezoToken: "0x7B7c000000000000000000000000000000000001",
  tigrisRouter: "0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9",
  tigrisPoolFactory: "0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A",
  tigrisMusdBtcPool: "0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9",
  /** First MezoutRouter (MUSD and BORROW only). Payment links without a router field were signed for it. */
  mezoutRouterV1: "0xAF79AB1cdB38c0C3944bB9440614B58871Ba6199",
  /** Canonical ERC-4337 EntryPoint v0.7; bytecode identical to Ethereum mainnet. */
  entryPoint07: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  /** Mezout passkey account factory, deployed at block 16,343,339. */
  mezoutAccountFactory: "0xeE85EE32488FF2D63eFe48159ddB59e6863cdF79",
} as const satisfies Record<string, Address>;
