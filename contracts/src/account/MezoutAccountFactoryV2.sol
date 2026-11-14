// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {MezoutAccountV2} from "./MezoutAccountV2.sol";

/// @title MezoutAccountFactoryV2
/// @notice Deterministic MezoutAccountV2 addresses from a passkey's public key, like MezoutAccountFactory. The same
/// passkey gets a different address here than in v1, because the account code differs.
contract MezoutAccountFactoryV2 {
    event AccountCreated(address indexed account, bytes32 qx, bytes32 qy);

    /// @notice Deploys the account for (qx, qy), or returns it if it already exists. Anyone may call this.
    function createAccount(bytes32 qx, bytes32 qy) external returns (address account) {
        account = getAddress(qx, qy);
        if (account.code.length == 0) {
            new MezoutAccountV2{salt: bytes32(0)}(qx, qy);
            emit AccountCreated(account, qx, qy);
        }
    }

    /// @dev The address depends only on the passkey the account was created with. A recovered account keeps its
    /// address, so look a recovered account up by address, not by its current passkey.
    function getAddress(bytes32 qx, bytes32 qy) public view returns (address) {
        bytes32 initCodeHash = keccak256(abi.encodePacked(type(MezoutAccountV2).creationCode, abi.encode(qx, qy)));
        return Create2.computeAddress(bytes32(0), initCodeHash);
    }
}
