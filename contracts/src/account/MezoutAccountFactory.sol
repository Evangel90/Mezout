// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {MezoutAccount} from "./MezoutAccount.sol";

/// @title MezoutAccountFactory
/// @notice Deterministic MezoutAccount addresses from a passkey's public key. An account's address is known, and can
/// receive MUSD, before it is deployed; it is deployed on its first user operation through the EntryPoint initCode.
contract MezoutAccountFactory {
    event AccountCreated(address indexed account, bytes32 qx, bytes32 qy);

    /// @notice Deploys the account for (qx, qy), or returns it if it already exists. Anyone may call this.
    function createAccount(bytes32 qx, bytes32 qy) external returns (address account) {
        account = getAddress(qx, qy);
        if (account.code.length == 0) {
            new MezoutAccount{salt: bytes32(0)}(qx, qy);
            emit AccountCreated(account, qx, qy);
        }
    }

    function getAddress(bytes32 qx, bytes32 qy) public view returns (address) {
        bytes32 initCodeHash = keccak256(abi.encodePacked(type(MezoutAccount).creationCode, abi.encode(qx, qy)));
        return Create2.computeAddress(bytes32(0), initCodeHash);
    }
}
