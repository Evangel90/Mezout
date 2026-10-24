// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MezoutRouter} from "../src/MezoutRouter.sol";

/// Mezo testnet only. Addresses confirmed in docs/M0-findings.md.
contract Deploy is Script {
    address internal constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address internal constant BORROWER_OPERATIONS_SIGNATURES = 0xD757e3646AF370b15f32EB557F0F8380Df7D639e;
    address internal constant TROVE_MANAGER = 0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0;
    address internal constant PRICE_FEED = 0x86bCF0841622a5dAC14A313a15f96A95421b9366;

    function run() external returns (MezoutRouter router) {
        require(block.chainid == 31611, "Mezo testnet only");
        address invoiceSigner = vm.envAddress("INVOICE_SIGNER_ADDRESS");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT_ADDRESS");

        vm.startBroadcast();
        router = new MezoutRouter(
            MUSD, BORROWER_OPERATIONS_SIGNATURES, TROVE_MANAGER, PRICE_FEED, invoiceSigner, feeRecipient
        );
        vm.stopBroadcast();

        console.log("MezoutRouter", address(router));
        console.log("deploy block", block.number);
    }
}
