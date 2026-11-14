// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MezoutRouter} from "../src/MezoutRouter.sol";
import {MezoMainnet} from "./config/MezoMainnet.sol";

interface IERC20Meta {
    function symbol() external view returns (string memory);
}

interface IBorrowerOperationsSignaturesView {
    function borrowerOperations() external view returns (address);
}

interface IBorrowerOperationsView {
    function musd() external view returns (address);
    function troveManager() external view returns (address);
    function priceFeed() external view returns (address);
    function borrowerOperationsSignaturesAddress() external view returns (address);
}

interface ITigrisFactoryView {
    function getPool(address tokenA, address tokenB, bool stable) external view returns (address);
}

/// MezoutRouter for Mezo mainnet. Every protocol constructor argument comes from script/config/MezoMainnet.sol; only
/// the invoice signer and fee recipient come from the environment. Read docs/MAINNET-CHECKLIST.md first.
///
/// Dry run only (no --broadcast) until the owner approves the launch in writing:
///   forge script script/DeployMainnet.s.sol --rpc-url $MEZO_MAINNET_RPC_URL
contract DeployMainnet is Script {
    error WrongChain(uint256 chainId);
    error NoCode(string name, address target);
    error Mismatch(string what);
    error BadRole(string what);

    function run() external returns (MezoutRouter router) {
        address invoiceSigner = vm.envAddress("INVOICE_SIGNER_ADDRESS");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT_ADDRESS");
        preflight(invoiceSigner, feeRecipient);

        vm.startBroadcast();
        router = new MezoutRouter(
            MezoMainnet.MUSD,
            MezoMainnet.BORROWER_OPERATIONS_SIGNATURES,
            MezoMainnet.TROVE_MANAGER,
            MezoMainnet.PRICE_FEED,
            invoiceSigner,
            feeRecipient,
            MezoMainnet.TIGRIS_POOL_FACTORY,
            MezoMainnet.BTC_TOKEN,
            MezoMainnet.MEZO_TOKEN
        );
        vm.stopBroadcast();

        console.log("MezoutRouter (mainnet)", address(router));
        console.log("deploy block", block.number);
        console.log("invoice signer", invoiceSigner);
        console.log("fee recipient", feeRecipient);
    }

    /// Read-only checks that the chain, every constructor address and the two roles are what the config says.
    function preflight(address invoiceSigner, address feeRecipient) public view {
        if (block.chainid != MezoMainnet.CHAIN_ID) revert WrongChain(block.chainid);

        _code("MUSD", MezoMainnet.MUSD);
        _code("BorrowerOperationsSignatures", MezoMainnet.BORROWER_OPERATIONS_SIGNATURES);
        _code("BorrowerOperations", MezoMainnet.BORROWER_OPERATIONS);
        _code("TroveManager", MezoMainnet.TROVE_MANAGER);
        _code("PriceFeed", MezoMainnet.PRICE_FEED);
        _code("Tigris PoolFactory", MezoMainnet.TIGRIS_POOL_FACTORY);
        _code("BTC", MezoMainnet.BTC_TOKEN);
        _code("MEZO", MezoMainnet.MEZO_TOKEN);

        // The protocol contracts must point at each other exactly as the config does.
        IBorrowerOperationsView bo = IBorrowerOperationsView(MezoMainnet.BORROWER_OPERATIONS);
        if (bo.musd() != MezoMainnet.MUSD) revert Mismatch("BorrowerOperations.musd");
        if (bo.troveManager() != MezoMainnet.TROVE_MANAGER) revert Mismatch("BorrowerOperations.troveManager");
        if (bo.priceFeed() != MezoMainnet.PRICE_FEED) revert Mismatch("BorrowerOperations.priceFeed");
        if (bo.borrowerOperationsSignaturesAddress() != MezoMainnet.BORROWER_OPERATIONS_SIGNATURES) {
            revert Mismatch("BorrowerOperations.borrowerOperationsSignaturesAddress");
        }
        if (
            IBorrowerOperationsSignaturesView(MezoMainnet.BORROWER_OPERATIONS_SIGNATURES).borrowerOperations()
                != MezoMainnet.BORROWER_OPERATIONS
        ) revert Mismatch("BorrowerOperationsSignatures.borrowerOperations");
        if (keccak256(bytes(IERC20Meta(MezoMainnet.MUSD).symbol())) != keccak256("MUSD")) revert Mismatch("MUSD.symbol");
        if (ITigrisFactoryView(MezoMainnet.TIGRIS_POOL_FACTORY).getPool(MezoMainnet.MUSD, MezoMainnet.BTC_TOKEN, false) != MezoMainnet.TIGRIS_MUSD_BTC_POOL) {
            revert Mismatch("Tigris MUSD/BTC pool");
        }

        if (invoiceSigner == address(0) || feeRecipient == address(0)) revert BadRole("zero address");
        if (invoiceSigner == feeRecipient) revert BadRole("invoice signer must not be the fee recipient");
        if (invoiceSigner.code.length != 0) revert BadRole("invoice signer must be an EOA (the router uses ECDSA)");
    }

    function _code(string memory name, address target) internal view {
        if (target == address(0) || target.code.length == 0) revert NoCode(name, target);
    }
}
