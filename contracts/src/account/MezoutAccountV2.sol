// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Account} from "@openzeppelin/contracts/account/Account.sol";
import {ERC7821} from "@openzeppelin/contracts/account/extensions/draft-ERC7821.sol";
import {ERC4337Utils} from "@openzeppelin/contracts/account/utils/draft-ERC4337Utils.sol";
import {IEntryPoint} from "@openzeppelin/contracts/interfaces/draft-IERC4337.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignerP256} from "@openzeppelin/contracts/utils/cryptography/signers/SignerP256.sol";
import {SignerWebAuthn} from "@openzeppelin/contracts/utils/cryptography/signers/SignerWebAuthn.sol";
import {PasskeyRecovery} from "./PasskeyRecovery.sol";

/// @title MezoutAccountV2
/// @notice MezoutAccount with passkey recovery: the same single-passkey ERC-4337 account, plus an optional recovery
/// signer that can replace a lost passkey after a delay the owner can cancel (see PasskeyRecovery).
/// @dev Not upgradeable, like v1: v1 accounts keep their code, and recovery comes with v2 accounts. Only the owner
/// passkey validates user operations; the recovery signer can never move funds.
contract MezoutAccountV2 is Account, SignerWebAuthn, ERC7821, PasskeyRecovery {
    constructor(bytes32 qx, bytes32 qy) SignerP256(qx, qy) EIP712("MezoutAccount", "2") {}

    function entryPoint() public pure override returns (IEntryPoint) {
        return ERC4337Utils.ENTRYPOINT_V07;
    }

    function _erc7821AuthorizedExecutor(address caller, bytes32 mode, bytes calldata executionData)
        internal
        view
        override
        returns (bool)
    {
        return caller == address(entryPoint()) || super._erc7821AuthorizedExecutor(caller, mode, executionData);
    }
}
