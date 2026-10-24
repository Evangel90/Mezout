// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Account} from "@openzeppelin/contracts/account/Account.sol";
import {ERC7821} from "@openzeppelin/contracts/account/extensions/draft-ERC7821.sol";
import {ERC4337Utils} from "@openzeppelin/contracts/account/utils/draft-ERC4337Utils.sol";
import {IEntryPoint} from "@openzeppelin/contracts/interfaces/draft-IERC4337.sol";
import {SignerP256} from "@openzeppelin/contracts/utils/cryptography/signers/SignerP256.sol";
import {SignerWebAuthn} from "@openzeppelin/contracts/utils/cryptography/signers/SignerWebAuthn.sol";

/// @title MezoutAccount
/// @notice ERC-4337 smart account owned by a single passkey (WebAuthn, P-256), so merchants need no wallet app.
/// @dev Built only from audited OpenZeppelin parts. User operations go through EntryPoint v0.7, the version deployed
/// on Mezo; the signed challenge is the userOpHash, which commits to the chain id and the EntryPoint. Calls run as an
/// ERC-7821 batch. Mezout's relayer acts as bundler and sponsors gas through the account's EntryPoint deposit, so the
/// account never needs BTC. Nobody but the passkey holder can move funds.
contract MezoutAccount is Account, SignerWebAuthn, ERC7821 {
    constructor(bytes32 qx, bytes32 qy) SignerP256(qx, qy) {}

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
