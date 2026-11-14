// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MezoutRouter} from "../../src/MezoutRouter.sol";
import {DeployMainnet, IBorrowerOperationsView, IBorrowerOperationsSignaturesView, IERC20Meta, ITigrisFactoryView} from
    "../../script/DeployMainnet.s.sol";
import {MezoMainnet} from "../../script/config/MezoMainnet.sol";

/// The mainnet deploy script against stand-ins for Mezo's contracts. Nothing here touches a network.
contract DeployMainnetTest is Test {
    DeployMainnet internal script;
    address internal constant SIGNER = address(0x5161);
    address internal constant FEES = address(0xFEE5);

    function setUp() public {
        script = new DeployMainnet();
        vm.chainId(MezoMainnet.CHAIN_ID);
        address[8] memory targets = [
            MezoMainnet.MUSD,
            MezoMainnet.BORROWER_OPERATIONS_SIGNATURES,
            MezoMainnet.BORROWER_OPERATIONS,
            MezoMainnet.TROVE_MANAGER,
            MezoMainnet.PRICE_FEED,
            MezoMainnet.TIGRIS_POOL_FACTORY,
            MezoMainnet.BTC_TOKEN,
            MezoMainnet.MEZO_TOKEN
        ];
        for (uint256 i; i < targets.length; ++i) {
            vm.etch(targets[i], hex"00");
        }
        address bo = MezoMainnet.BORROWER_OPERATIONS;
        vm.mockCall(bo, abi.encodeCall(IBorrowerOperationsView.musd, ()), abi.encode(MezoMainnet.MUSD));
        vm.mockCall(bo, abi.encodeCall(IBorrowerOperationsView.troveManager, ()), abi.encode(MezoMainnet.TROVE_MANAGER));
        vm.mockCall(bo, abi.encodeCall(IBorrowerOperationsView.priceFeed, ()), abi.encode(MezoMainnet.PRICE_FEED));
        vm.mockCall(
            bo,
            abi.encodeCall(IBorrowerOperationsView.borrowerOperationsSignaturesAddress, ()),
            abi.encode(MezoMainnet.BORROWER_OPERATIONS_SIGNATURES)
        );
        vm.mockCall(
            MezoMainnet.BORROWER_OPERATIONS_SIGNATURES,
            abi.encodeCall(IBorrowerOperationsSignaturesView.borrowerOperations, ()),
            abi.encode(bo)
        );
        vm.mockCall(MezoMainnet.MUSD, abi.encodeCall(IERC20Meta.symbol, ()), abi.encode("MUSD"));
        vm.mockCall(
            MezoMainnet.TIGRIS_POOL_FACTORY,
            abi.encodeCall(ITigrisFactoryView.getPool, (MezoMainnet.MUSD, MezoMainnet.BTC_TOKEN, false)),
            abi.encode(MezoMainnet.TIGRIS_MUSD_BTC_POOL)
        );
        vm.setEnv("INVOICE_SIGNER_ADDRESS", vm.toString(SIGNER));
        vm.setEnv("FEE_RECIPIENT_ADDRESS", vm.toString(FEES));
    }

    function test_deploysWithTheVerifiedConstructorArguments() public {
        MezoutRouter router = script.run();
        assertEq(address(router.musd()), MezoMainnet.MUSD);
        assertEq(address(router.borrowerOperationsSignatures()), MezoMainnet.BORROWER_OPERATIONS_SIGNATURES);
        assertEq(address(router.troveManager()), MezoMainnet.TROVE_MANAGER);
        assertEq(address(router.priceFeed()), MezoMainnet.PRICE_FEED);
        assertEq(address(router.tigrisFactory()), MezoMainnet.TIGRIS_POOL_FACTORY);
        assertEq(address(router.btc()), MezoMainnet.BTC_TOKEN);
        assertEq(address(router.mezo()), MezoMainnet.MEZO_TOKEN);
        assertEq(router.invoiceSigner(), SIGNER);
        assertEq(router.feeRecipient(), FEES);
    }

    function test_refusesAnyOtherChain() public {
        vm.chainId(31611);
        vm.expectRevert(abi.encodeWithSelector(DeployMainnet.WrongChain.selector, uint256(31611)));
        script.preflight(SIGNER, FEES);
    }

    function test_refusesAnAddressWithoutCode() public {
        vm.etch(MezoMainnet.PRICE_FEED, "");
        vm.expectRevert(abi.encodeWithSelector(DeployMainnet.NoCode.selector, "PriceFeed", MezoMainnet.PRICE_FEED));
        script.preflight(SIGNER, FEES);
    }

    function test_refusesProtocolWiringThatDisagreesWithTheConfig() public {
        vm.mockCall(
            MezoMainnet.BORROWER_OPERATIONS, abi.encodeCall(IBorrowerOperationsView.troveManager, ()), abi.encode(address(1))
        );
        vm.expectRevert(abi.encodeWithSelector(DeployMainnet.Mismatch.selector, "BorrowerOperations.troveManager"));
        script.preflight(SIGNER, FEES);
    }

    function test_refusesBadRoles() public {
        vm.expectRevert(abi.encodeWithSelector(DeployMainnet.BadRole.selector, "zero address"));
        script.preflight(address(0), FEES);
        vm.expectRevert(
            abi.encodeWithSelector(DeployMainnet.BadRole.selector, "invoice signer must not be the fee recipient")
        );
        script.preflight(SIGNER, SIGNER);
        vm.etch(SIGNER, hex"00");
        vm.expectRevert(
            abi.encodeWithSelector(DeployMainnet.BadRole.selector, "invoice signer must be an EOA (the router uses ECDSA)")
        );
        script.preflight(SIGNER, FEES);
    }

    /// Tripwire: the EntryPoint stays unverified until the owner confirms it; update the SDK config in the same change.
    function test_entryPointIsStillUnverified() public pure {
        assertEq(MezoMainnet.ENTRY_POINT_V07, address(0));
    }
}
