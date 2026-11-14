// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MezoutAccountFactoryV2} from "../src/account/MezoutAccountFactoryV2.sol";

/// Mezo testnet only. Passkey accounts with recovery (MezoutAccountV2) use the canonical EntryPoint v0.7 already deployed there.
contract DeployAccountFactoryV2 is Script {
    address internal constant ENTRY_POINT_V07 = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    function run() external returns (MezoutAccountFactoryV2 factory) {
        require(block.chainid == 31611, "Mezo testnet only");
        require(ENTRY_POINT_V07.code.length > 0, "EntryPoint v0.7 missing");

        vm.startBroadcast();
        factory = new MezoutAccountFactoryV2();
        vm.stopBroadcast();

        console.log("MezoutAccountFactoryV2", address(factory));
        console.log("deploy block", block.number);
    }
}
