// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Mezo testnet (chain 31611). Source: mezo-org/musd solidity/artifacts/deployments/matsnet @ de1ec2af,
// npm @mezo-org/musd-contracts 1.1.0, Mezo docs contracts-reference. Confirmed on-chain 24 Oct 2026.
library MezoTestnet {
    uint256 internal constant CHAIN_ID = 31611;

    address internal constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address internal constant BORROWER_OPERATIONS = 0xCdF7028ceAB81fA0C6971208e83fa7872994beE5;
    address internal constant BORROWER_OPERATIONS_SIGNATURES = 0xD757e3646AF370b15f32EB557F0F8380Df7D639e;
    address internal constant TROVE_MANAGER = 0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0;
    address internal constant HINT_HELPERS = 0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6;
    address internal constant SORTED_TROVES = 0x722E4D24FD6Ff8b0AC679450F3D91294607268fA;
    address internal constant PRICE_FEED = 0x86bCF0841622a5dAC14A313a15f96A95421b9366;
    address internal constant ACTIVE_POOL = 0x143A063F62340DA3A8bEA1C5642d18C6D0F7FF51;

    /// Native precompiles: Foundry's EVM cannot execute them, so fork tests mock them.
    address internal constant BTC_ORACLE = 0x7b7c000000000000000000000000000000000015;
    address internal constant BTC_TOKEN = 0x7b7C000000000000000000000000000000000000;
    address internal constant MEZO_TOKEN = 0x7B7c000000000000000000000000000000000001;

    address internal constant TIGRIS_ROUTER = 0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9;
    address internal constant TIGRIS_POOL_FACTORY = 0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A;
    address internal constant TIGRIS_MUSD_BTC_POOL = 0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9;

    uint256 internal constant MCR = 1.1e18;
    uint256 internal constant CCR = 1.5e18;
}
