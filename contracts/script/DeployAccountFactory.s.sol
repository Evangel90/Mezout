// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MezoutAccountFactory} from "../src/account/MezoutAccountFactory.sol";

/// Mezo testnet only. Passkey accounts use the canonical EntryPoint v0.7 already deployed there.
contract DeployAccountFactory is Script {
    address internal constant ENTRY_POINT_V07 = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    function run() external returns (MezoutAccountFactory factory) {
        require(block.chainid == 31611, "Mezo testnet only");
        require(ENTRY_POINT_V07.code.length > 0, "EntryPoint v0.7 missing");

        vm.startBroadcast();
        factory = new MezoutAccountFactory();
        vm.stopBroadcast();

        console.log("MezoutAccountFactory", address(factory));
        console.log("deploy block", block.number);
    }
}
