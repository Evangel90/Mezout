// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {MezoutRouter} from "../../src/MezoutRouter.sol";
import {IAggregatorV3} from "../../src/interfaces/mezo/IAggregatorV3.sol";
import {ITroveManager} from "../../src/interfaces/mezo/ITroveManager.sol";
import {IBorrowerOperationsSignatures} from "../../src/interfaces/mezo/IBorrowerOperationsSignatures.sol";
import {MezoTestnet} from "../utils/MezoTestnet.sol";

interface IBorrowerOperationsOpen {
    function openTrove(uint256 debtAmount, address upperHint, address lowerHint) external payable;
}

/// End to end against the real MUSD protocol on a Mezo testnet fork, with only the price precompile mocked.
contract MezoutRouterForkTest is Test {
    bytes32 internal constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 internal constant WITHDRAW_MUSD_TYPEHASH =
        keccak256("WithdrawMUSD(uint256 amount,address borrower,address recipient,uint256 nonce,uint256 deadline)");

    IERC20 internal musd = IERC20(MezoTestnet.MUSD);
    IBorrowerOperationsSignatures internal bos =
        IBorrowerOperationsSignatures(MezoTestnet.BORROWER_OPERATIONS_SIGNATURES);
    ITroveManager internal troveManager = ITroveManager(MezoTestnet.TROVE_MANAGER);
    MezoutRouter internal router;

    uint256 internal signerPk = 0xA11CE;
    uint256 internal payerPk = 0xB0B;
    address internal payer;
    address internal merchant = makeAddr("merchant");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal relayer = makeAddr("relayer");

    function setUp() public {
        vm.createSelectFork(vm.envOr("MEZO_RPC_URL", string("https://rpc.test.mezo.org")), 16_339_000);
        _pinOracle(80_000e18);
        payer = vm.addr(payerPk);
        router = new MezoutRouter(
            MezoTestnet.MUSD,
            MezoTestnet.BORROWER_OPERATIONS_SIGNATURES,
            MezoTestnet.TROVE_MANAGER,
            MezoTestnet.PRICE_FEED,
            vm.addr(signerPk),
            feeRecipient
        );

        // Payer opens a real trove: 0.1 BTC (8,000 MUSD of value) against 2,000 MUSD net debt.
        vm.deal(payer, 1e18);
        vm.prank(payer);
        IBorrowerOperationsOpen(MezoTestnet.BORROWER_OPERATIONS).openTrove{value: 0.1e18}(
            2_000e18, address(0), address(0)
        );
    }

    function _pinOracle(int256 answer) internal {
        vm.mockCall(MezoTestnet.BTC_ORACLE, abi.encodeCall(IAggregatorV3.decimals, ()), abi.encode(uint8(18)));
        vm.mockCall(
            MezoTestnet.BTC_ORACLE,
            abi.encodeCall(IAggregatorV3.latestRoundData, ()),
            abi.encode(uint80(1), answer, block.timestamp, block.timestamp, uint80(1))
        );
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _domain(address target) internal view returns (bytes32) {
        (, string memory name, string memory version, uint256 chainId, address verifying,,) =
            IERC5267Like(target).eip712Domain();
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                verifying
            )
        );
    }

    function _invoice(uint256 amount, uint256 fee, bytes32 orderId)
        internal
        view
        returns (MezoutRouter.Invoice memory)
    {
        return MezoutRouter.Invoice({
            merchant: merchant, amount: amount, fee: fee, orderId: orderId, expiry: uint64(block.timestamp + 1 hours)
        });
    }

    function _permit(uint256 value) internal view returns (MezoutRouter.PermitSig memory p) {
        p.deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                PERMIT_TYPEHASH, payer, address(router), value, IERC20Permit(address(musd)).nonces(payer), p.deadline
            )
        );
        (p.v, p.r, p.s) = vm.sign(payerPk, keccak256(abi.encodePacked("\x19\x01", _domain(address(musd)), structHash)));
    }

    function _borrowAuth(uint256 amount) internal view returns (MezoutRouter.BorrowAuth memory a) {
        a.deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(WITHDRAW_MUSD_TYPEHASH, amount, payer, address(router), bos.getNonce(payer), a.deadline)
        );
        a.signature = _sign(payerPk, keccak256(abi.encodePacked("\x19\x01", _domain(address(bos)), structHash)));
    }

    function test_fork_troveOpened() public view {
        assertEq(uint8(troveManager.getTroveStatus(payer)), uint8(ITroveManager.Status.active));
        assertEq(musd.balanceOf(payer), 2_000e18);
    }

    function test_fork_payWithMUSD() public {
        MezoutRouter.Invoice memory inv = _invoice(150e18, 1.5e18, "fork-musd");
        bytes memory paySig = _sign(payerPk, router.hashPayment(inv, payer));
        bytes memory invSig = _sign(signerPk, router.hashInvoice(inv));

        vm.prank(relayer);
        router.payWithMUSD(inv, invSig, payer, paySig, _permit(150e18));

        assertEq(musd.balanceOf(merchant), 148.5e18);
        assertEq(musd.balanceOf(feeRecipient), 1.5e18);
        assertEq(musd.balanceOf(address(router)), 0);
    }

    function test_fork_payWithBorrow() public {
        MezoutRouter.Invoice memory inv = _invoice(1_000e18, 0, "fork-borrow");
        bytes memory paySig = _sign(payerPk, router.hashPayment(inv, payer));
        bytes memory invSig = _sign(signerPk, router.hashInvoice(inv));
        MezoutRouter.BorrowAuth memory b = _borrowAuth(800e18);
        MezoutRouter.PermitSig memory p = _permit(200e18);

        vm.prank(relayer);
        router.payWithBorrow(inv, invSig, payer, paySig, 200e18, p, b);

        assertEq(musd.balanceOf(merchant), 1_000e18);
        assertEq(musd.balanceOf(payer), 1_800e18);
        assertEq(musd.balanceOf(address(router)), 0);
        uint256 icr = troveManager.getCurrentICR(payer, 80_000e18);
        assertGe(icr, router.MIN_BORROW_ICR());
        emit log_named_decimal_uint("ICR after %", icr * 100, 18);
    }

    function test_fork_revert_borrowBelowSafetyFloor() public {
        // 8,000 MUSD of collateral; existing debt ~2,202 (2,000 + 200 gas comp + 0.1% fee). Borrowing 3,000 more: ~153%.
        MezoutRouter.Invoice memory inv = _invoice(3_000e18, 0, "fork-floor");
        bytes memory paySig = _sign(payerPk, router.hashPayment(inv, payer));
        bytes memory invSig = _sign(signerPk, router.hashInvoice(inv));
        MezoutRouter.BorrowAuth memory b = _borrowAuth(3_000e18);
        MezoutRouter.PermitSig memory none;

        vm.prank(relayer);
        vm.expectPartialRevert(MezoutRouter.TroveBelowSafetyFloor.selector);
        router.payWithBorrow(inv, invSig, payer, paySig, 0, none, b);
    }
}

interface IERC5267Like {
    function eip712Domain()
        external
        view
        returns (bytes1, string memory, string memory, uint256, address, bytes32, uint256[] memory);
}
