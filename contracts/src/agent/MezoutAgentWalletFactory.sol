// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {MezoutAgentWallet} from "./MezoutAgentWallet.sol";

/// @title MezoutAgentWalletFactory
/// @notice Deploys agent wallets at addresses fixed by (owner, salt), and records them so Mezout's relayer submits
/// `pay` only to genuine wallets (any other contract could waste the relayer's gas).
contract MezoutAgentWalletFactory {
    /// @notice The router new wallets start with; each wallet's owner can move it later.
    address public immutable router;

    mapping(address wallet => bool) public isWallet;

    event WalletCreated(address indexed wallet, address indexed owner, bytes32 salt);

    error ZeroAddress();

    constructor(address router_) {
        if (router_ == address(0)) revert ZeroAddress();
        router = router_;
    }

    /// @notice Deploys the wallet for (owner, salt), or returns it if it exists. Anyone may call this; the owner is
    /// part of the address, so nobody can take another owner's address.
    function createWallet(address owner, bytes32 salt) external returns (address wallet) {
        if (owner == address(0)) revert ZeroAddress();
        wallet = getAddress(owner, salt);
        if (wallet.code.length == 0) {
            new MezoutAgentWallet{salt: _salt(owner, salt)}(owner, router);
            isWallet[wallet] = true;
            emit WalletCreated(wallet, owner, salt);
        }
    }

    function getAddress(address owner, bytes32 salt) public view returns (address) {
        bytes32 initCodeHash =
            keccak256(abi.encodePacked(type(MezoutAgentWallet).creationCode, abi.encode(owner, router)));
        return Create2.computeAddress(_salt(owner, salt), initCodeHash);
    }

    function _salt(address owner, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encode(owner, salt));
    }
}
