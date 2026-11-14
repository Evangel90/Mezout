// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Mezo mainnet (chain 31612): the same verified addresses as packages/sdk/src/networks.ts (mainnetConfig). Keep both
/// in step. Each address is listed in an official Mezo source and was checked read-only on-chain on 14 Nov 2026 at
/// block 13,220,720 through two documented RPCs (mezo-mainnet.boar.network, mainnet.mezo.public.validationcloud.io).
/// address(0) means unverified: scripts that need one refuse to run.
library MezoMainnet {
    uint256 internal constant CHAIN_ID = 31612;

    // Mezo docs contracts-reference.md and mezo-org/musd @ da7888a1 deployments/mainnet/MUSD.json.
    // name() "Mezo USD", symbol() "MUSD", DOMAIN_SEPARATOR = ("Mezo USD", "1", 31612, this).
    address internal constant MUSD = 0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186;
    // mezo-org/musd @ da7888a1 BorrowerOperationsSignatures.json; eip712Domain() = ("BorrowerOperationsSignatures", "1",
    // 31612, this); borrowerOperations() = BORROWER_OPERATIONS.
    address internal constant BORROWER_OPERATIONS_SIGNATURES = 0xB57ab578BF20b3e318f3EFAA587C51DBccE5df7a;
    // mezo-org/musd @ da7888a1 BorrowerOperations.json; its musd(), troveManager(), priceFeed() and
    // borrowerOperationsSignaturesAddress() return the constants here.
    address internal constant BORROWER_OPERATIONS = 0x44b1bac67dDA612a41a58AAf779143B181dEe031;
    // mezo-org/musd @ da7888a1 TroveManager.json; musdToken() = MUSD, MUSD_GAS_COMPENSATION() = 200e18.
    address internal constant TROVE_MANAGER = 0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193;
    // mezo-org/musd @ da7888a1 PriceFeed.json; oracle() = BTC_ORACLE.
    address internal constant PRICE_FEED = 0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88;
    address internal constant HINT_HELPERS = 0xD267b3bE2514375A075fd03C3D9CBa6b95317DC3;
    address internal constant SORTED_TROVES = 0x8C5DB4C62BF29c1C4564390d10c20a47E0b2749f;

    // Precompiles. BTC and MEZO token addresses from Mezo docs contracts-reference.md; the oracle is PriceFeed.oracle().
    address internal constant BTC_TOKEN = 0x7b7C000000000000000000000000000000000000;
    address internal constant MEZO_TOKEN = 0x7B7c000000000000000000000000000000000001;
    address internal constant BTC_ORACLE = 0x7b7c000000000000000000000000000000000015;

    // Mezo docs (Pool Contracts) and mezo-org/tigris @ 0a3b5e84 deployments/mainnet.
    address internal constant TIGRIS_ROUTER = 0x16A76d3cd3C1e3CE843C6680d6B37E9116b5C706;
    address internal constant TIGRIS_POOL_FACTORY = 0x83FE469C636C4081b87bA5b3Ae9991c6Ed104248;
    // getPool(MUSD, BTC, false) on the factory; volatile, fee 30 bps (testnet: 4 bps).
    address internal constant TIGRIS_MUSD_BTC_POOL = 0x52e604c44417233b6CcEDDDc0d640A405Caacefb;

    // UNVERIFIED. Canonical v0.7 bytecode is present, but no Mezo doc or repo lists it. Owner to confirm.
    address internal constant ENTRY_POINT_V07 = address(0);
}
