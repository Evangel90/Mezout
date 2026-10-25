// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MezoutRouter} from "../../src/MezoutRouter.sol";
import {MockMUSD} from "../mocks/MockMUSD.sol";
import {MockPriceFeed, MockTroveManager, MockBorrowerOperationsSignatures} from "../mocks/MockTroveSystem.sol";

contract MezoutRouterTest is Test {
    bytes32 internal constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    MockMUSD internal musd;
    MockPriceFeed internal priceFeed;
    MockTroveManager internal troveManager;
    MockBorrowerOperationsSignatures internal bos;
    MezoutRouter internal router;

    uint256 internal signerPk = 0xA11CE;
    uint256 internal payerPk = 0xB0B;
    uint256 internal attackerPk = 0xBAD;
    address internal signer;
    address internal payer;
    address internal attacker;
    address internal merchant = makeAddr("merchant");
    address internal attackerMerchant = makeAddr("attackerMerchant");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal relayer = makeAddr("relayer");

    function setUp() public {
        signer = vm.addr(signerPk);
        payer = vm.addr(payerPk);
        attacker = vm.addr(attackerPk);
        musd = new MockMUSD();
        priceFeed = new MockPriceFeed();
        troveManager = new MockTroveManager();
        bos = new MockBorrowerOperationsSignatures(musd, troveManager);
        router = new MezoutRouter(
            address(musd),
            address(bos),
            address(troveManager),
            address(priceFeed),
            signer,
            feeRecipient,
            makeAddr("tigrisFactory"),
            makeAddr("btc"),
            makeAddr("mezo")
        );
        musd.mint(payer, 10_000e18);
        // 1 BTC at 80,000 against 10,000 MUSD debt: 800%.
        troveManager.setTrove(payer, 1e18, 10_000e18);
    }

    // ---------------------------------------------------------------- helpers

    function _invoice(uint256 amount, uint256 fee, bytes32 orderId)
        internal
        view
        returns (MezoutRouter.Invoice memory)
    {
        return MezoutRouter.Invoice({
            merchant: merchant, amount: amount, fee: fee, orderId: orderId, expiry: uint64(block.timestamp + 1 hours)
        });
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signInvoice(MezoutRouter.Invoice memory inv) internal view returns (bytes memory) {
        return _sign(signerPk, router.hashInvoice(inv));
    }

    function _signPayment(uint256 pk, MezoutRouter.Invoice memory inv, address who)
        internal
        view
        returns (bytes memory)
    {
        return _sign(pk, router.hashPayment(inv, who));
    }

    function _permit(uint256 pk, address owner, uint256 value) internal view returns (MezoutRouter.PermitSig memory p) {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash =
            keccak256(abi.encode(PERMIT_TYPEHASH, owner, address(router), value, musd.nonces(owner), deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", musd.DOMAIN_SEPARATOR(), structHash));
        (p.v, p.r, p.s) = vm.sign(pk, digest);
        p.deadline = deadline;
    }

    function _noPermit() internal pure returns (MezoutRouter.PermitSig memory p) {}

    function _borrowAuth(uint256 pk, address borrower, uint256 amount, address recipient)
        internal
        view
        returns (MezoutRouter.BorrowAuth memory a)
    {
        a.deadline = block.timestamp + 1 hours;
        a.signature = _sign(pk, bos.withdrawDigest(amount, borrower, recipient, a.deadline));
    }

    function _assertRouterEmpty() internal view {
        assertEq(musd.balanceOf(address(router)), 0, "router holds MUSD");
        assertEq(address(router).balance, 0, "router holds BTC");
    }

    // ---------------------------------------------------------------- MUSD path

    function test_payWithMUSD_relayed_paysMerchantAndFee() public {
        MezoutRouter.Invoice memory inv = _invoice(100e18, 1e18, "order-1");
        bytes memory paySig = _signPayment(payerPk, inv, payer);

        vm.expectEmit(address(router));
        emit MezoutRouter.Paid(
            inv.orderId, merchant, payer, 100e18, 1e18, MezoutRouter.Method.MUSD, address(musd), 100e18, 0
        );
        vm.prank(relayer);
        router.payWithMUSD(inv, _signInvoice(inv), payer, paySig, _permit(payerPk, payer, 100e18));

        assertEq(musd.balanceOf(merchant), 99e18);
        assertEq(musd.balanceOf(feeRecipient), 1e18);
        assertEq(musd.balanceOf(payer), 9_900e18);
        assertTrue(router.paid("order-1"));
        _assertRouterEmpty();
    }

    function test_payWithMUSD_directWithApprovalNeedsNoPayerSig() public {
        MezoutRouter.Invoice memory inv = _invoice(50e18, 0, "order-2");
        vm.startPrank(payer);
        musd.approve(address(router), 50e18);
        router.payWithMUSD(inv, _signInvoice(inv), payer, "", _noPermit());
        vm.stopPrank();
        assertEq(musd.balanceOf(merchant), 50e18);
        assertEq(musd.balanceOf(feeRecipient), 0);
    }

    function test_revert_payTwice() public {
        MezoutRouter.Invoice memory inv = _invoice(10e18, 0, "order-3");
        vm.startPrank(payer);
        musd.approve(address(router), 20e18);
        router.payWithMUSD(inv, _signInvoice(inv), payer, "", _noPermit());
        bytes memory invSig = _signInvoice(inv);
        vm.expectRevert(MezoutRouter.InvoiceAlreadyPaid.selector);
        router.payWithMUSD(inv, invSig, payer, "", _noPermit());
        vm.stopPrank();
    }

    function test_revert_expired() public {
        MezoutRouter.Invoice memory inv = _invoice(10e18, 0, "order-4");
        bytes memory invSig = _signInvoice(inv);
        vm.warp(inv.expiry + 1);
        vm.prank(payer);
        vm.expectRevert(MezoutRouter.InvoiceExpired.selector);
        router.payWithMUSD(inv, invSig, payer, "", _noPermit());
    }

    function test_revert_tamperedFields() public {
        MezoutRouter.Invoice memory inv = _invoice(10e18, 0, "order-5");
        bytes memory invSig = _signInvoice(inv);
        vm.startPrank(payer);
        musd.approve(address(router), type(uint256).max);

        MezoutRouter.Invoice memory t = inv;
        t.merchant = attackerMerchant;
        vm.expectRevert(MezoutRouter.InvalidInvoiceSignature.selector);
        router.payWithMUSD(t, invSig, payer, "", _noPermit());

        t = _invoice(10e18, 0, "order-5");
        t.amount = 1e18;
        vm.expectRevert(MezoutRouter.InvalidInvoiceSignature.selector);
        router.payWithMUSD(t, invSig, payer, "", _noPermit());

        t = _invoice(10e18, 0, "order-5");
        t.fee = 5e18;
        vm.expectRevert(MezoutRouter.InvalidInvoiceSignature.selector);
        router.payWithMUSD(t, invSig, payer, "", _noPermit());

        t = _invoice(10e18, 0, "order-5");
        t.orderId = "order-other";
        vm.expectRevert(MezoutRouter.InvalidInvoiceSignature.selector);
        router.payWithMUSD(t, invSig, payer, "", _noPermit());

        t = _invoice(10e18, 0, "order-5");
        t.expiry += 1;
        vm.expectRevert(MezoutRouter.InvalidInvoiceSignature.selector);
        router.payWithMUSD(t, invSig, payer, "", _noPermit());
        vm.stopPrank();
    }

    function test_revert_invoiceNotSignedByPlatform() public {
        MezoutRouter.Invoice memory inv = _invoice(10e18, 0, "order-6");
        bytes memory badSig = _sign(attackerPk, router.hashInvoice(inv));
        vm.prank(payer);
        vm.expectRevert(MezoutRouter.InvalidInvoiceSignature.selector);
        router.payWithMUSD(inv, badSig, payer, "", _noPermit());
    }

    function test_revert_feeAboveAmount() public {
        MezoutRouter.Invoice memory inv = _invoice(10e18, 11e18, "order-7");
        bytes memory invSig = _signInvoice(inv);
        vm.prank(payer);
        vm.expectRevert(MezoutRouter.InvalidInvoice.selector);
        router.payWithMUSD(inv, invSig, payer, "", _noPermit());
    }

    function test_revert_relayedWithoutPayerSig() public {
        MezoutRouter.Invoice memory inv = _invoice(10e18, 0, "order-8");
        MezoutRouter.PermitSig memory p = _permit(payerPk, payer, 10e18);
        bytes memory invSig = _signInvoice(inv);
        vm.prank(relayer);
        vm.expectRevert(MezoutRouter.InvalidPayerSignature.selector);
        router.payWithMUSD(inv, invSig, payer, "", p);
    }

    /// A watcher copies the payer's permit and points it at an invoice for their own merchant.
    function test_revert_stolenPermitCannotPayOtherInvoice() public {
        MezoutRouter.Invoice memory honest = _invoice(10e18, 0, "order-9");
        MezoutRouter.PermitSig memory p = _permit(payerPk, payer, 10e18);
        bytes memory paySig = _signPayment(payerPk, honest, payer);

        MezoutRouter.Invoice memory evil = honest;
        evil.merchant = attackerMerchant;
        evil.orderId = "evil-order";
        bytes memory evilInvSig = _signInvoice(evil);

        vm.prank(attacker);
        vm.expectRevert(MezoutRouter.InvalidPayerSignature.selector);
        router.payWithMUSD(evil, evilInvSig, payer, paySig, p);
        assertEq(musd.balanceOf(attackerMerchant), 0);
    }

    function test_frontRunPermitDoesNotBlockPayment() public {
        MezoutRouter.Invoice memory inv = _invoice(10e18, 0, "order-10");
        MezoutRouter.PermitSig memory p = _permit(payerPk, payer, 10e18);
        bytes memory paySig = _signPayment(payerPk, inv, payer);

        vm.prank(attacker);
        musd.permit(payer, address(router), 10e18, p.deadline, p.v, p.r, p.s);

        vm.prank(relayer);
        router.payWithMUSD(inv, _signInvoice(inv), payer, paySig, p);
        assertEq(musd.balanceOf(merchant), 10e18);
    }

    function test_revert_noAllowanceNoPermit() public {
        MezoutRouter.Invoice memory inv = _invoice(10e18, 0, "order-11");
        bytes memory invSig = _signInvoice(inv);
        vm.prank(payer);
        vm.expectRevert(MezoutRouter.PermitFailed.selector);
        router.payWithMUSD(inv, invSig, payer, "", _noPermit());
    }

    function testFuzz_payWithMUSD_exactSplit(uint256 amount, uint256 fee) public {
        amount = bound(amount, 1, 10_000e18);
        fee = bound(fee, 0, amount);
        MezoutRouter.Invoice memory inv = _invoice(amount, fee, keccak256(abi.encode(amount, fee)));
        bytes memory paySig = _signPayment(payerPk, inv, payer);
        vm.prank(relayer);
        router.payWithMUSD(inv, _signInvoice(inv), payer, paySig, _permit(payerPk, payer, amount));
        assertEq(musd.balanceOf(merchant), amount - fee);
        assertEq(musd.balanceOf(feeRecipient), fee);
        assertEq(musd.balanceOf(payer), 10_000e18 - amount);
        _assertRouterEmpty();
    }

    // ---------------------------------------------------------------- BORROW path

    function test_payWithBorrow_fullBorrow() public {
        MezoutRouter.Invoice memory inv = _invoice(2_000e18, 20e18, "order-20");
        bytes memory paySig = _signPayment(payerPk, inv, payer);
        MezoutRouter.BorrowAuth memory b = _borrowAuth(payerPk, payer, 2_000e18, address(router));

        vm.prank(relayer);
        router.payWithBorrow(inv, _signInvoice(inv), payer, paySig, 0, _noPermit(), b);

        assertEq(musd.balanceOf(merchant), 1_980e18);
        assertEq(musd.balanceOf(feeRecipient), 20e18);
        assertEq(musd.balanceOf(payer), 10_000e18, "payer balance untouched");
        assertEq(troveManager.debt(payer), 12_000e18);
        _assertRouterEmpty();
    }

    function test_payWithBorrow_partFromBalance() public {
        MezoutRouter.Invoice memory inv = _invoice(2_000e18, 0, "order-21");
        bytes memory paySig = _signPayment(payerPk, inv, payer);
        MezoutRouter.BorrowAuth memory b = _borrowAuth(payerPk, payer, 1_500e18, address(router));

        vm.expectEmit(address(router));
        emit MezoutRouter.Paid(
            inv.orderId, merchant, payer, 2_000e18, 0, MezoutRouter.Method.BORROW, address(musd), 500e18, 1_500e18
        );
        vm.prank(relayer);
        router.payWithBorrow(inv, _signInvoice(inv), payer, paySig, 500e18, _permit(payerPk, payer, 500e18), b);

        assertEq(musd.balanceOf(merchant), 2_000e18);
        assertEq(musd.balanceOf(payer), 9_500e18);
        assertEq(troveManager.debt(payer), 11_500e18);
        _assertRouterEmpty();
    }

    function test_revert_borrowBelowSafetyFloor() public {
        // 1 BTC at 80,000 with 10,000 debt; borrowing 40,001 leaves 50,001 debt: ~159.99%.
        MezoutRouter.Invoice memory inv = _invoice(40_001e18, 0, "order-22");
        bytes memory paySig = _signPayment(payerPk, inv, payer);
        MezoutRouter.BorrowAuth memory b = _borrowAuth(payerPk, payer, 40_001e18, address(router));
        bytes memory invSig = _signInvoice(inv);

        uint256 icrAfter = uint256(1e18) * 80_000e18 / 50_001e18;
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(MezoutRouter.TroveBelowSafetyFloor.selector, icrAfter));
        router.payWithBorrow(inv, invSig, payer, paySig, 0, _noPermit(), b);
    }

    function test_borrowAtExactlySafetyFloorSucceeds() public {
        // 10,000 + 40,000 = 50,000 debt against 80,000 collateral value: exactly 160%.
        MezoutRouter.Invoice memory inv = _invoice(40_000e18, 0, "order-23");
        bytes memory paySig = _signPayment(payerPk, inv, payer);
        MezoutRouter.BorrowAuth memory b = _borrowAuth(payerPk, payer, 40_000e18, address(router));
        vm.prank(relayer);
        router.payWithBorrow(inv, _signInvoice(inv), payer, paySig, 0, _noPermit(), b);
        assertEq(musd.balanceOf(merchant), 40_000e18);
    }

    /// The borrow signature names the router as recipient; it must not pay an invoice the payer did not choose.
    function test_revert_stolenBorrowSigCannotPayOtherInvoice() public {
        MezoutRouter.Invoice memory honest = _invoice(1_000e18, 0, "order-24");
        bytes memory paySig = _signPayment(payerPk, honest, payer);
        MezoutRouter.BorrowAuth memory b = _borrowAuth(payerPk, payer, 1_000e18, address(router));

        MezoutRouter.Invoice memory evil = honest;
        evil.merchant = attackerMerchant;
        evil.orderId = "evil-borrow";
        bytes memory evilInvSig = _signInvoice(evil);

        vm.prank(attacker);
        vm.expectRevert(MezoutRouter.InvalidPayerSignature.selector);
        router.payWithBorrow(evil, evilInvSig, payer, paySig, 0, _noPermit(), b);
        assertEq(troveManager.debt(payer), 10_000e18);
    }

    function test_revert_borrowSigForOtherRecipient() public {
        MezoutRouter.Invoice memory inv = _invoice(1_000e18, 0, "order-25");
        bytes memory paySig = _signPayment(payerPk, inv, payer);
        MezoutRouter.BorrowAuth memory b = _borrowAuth(payerPk, payer, 1_000e18, attacker);
        bytes memory invSig = _signInvoice(inv);
        vm.prank(relayer);
        vm.expectRevert("BorrowerOperationsSignatures: Invalid signature");
        router.payWithBorrow(inv, invSig, payer, paySig, 0, _noPermit(), b);
    }

    function test_revert_borrowNothing() public {
        MezoutRouter.Invoice memory inv = _invoice(1_000e18, 0, "order-26");
        bytes memory invSig = _signInvoice(inv);
        MezoutRouter.BorrowAuth memory b;
        vm.prank(payer);
        vm.expectRevert(MezoutRouter.InvalidBorrowAmount.selector);
        router.payWithBorrow(inv, invSig, payer, "", 1_000e18, _noPermit(), b);
    }

    function test_revert_routerRejectsNonZeroBTC() public {
        vm.deal(payer, 1 ether);
        vm.prank(payer);
        (bool ok,) = address(router).call{value: 1}("");
        assertFalse(ok);
    }

    function testFuzz_payWithBorrow_exactSplit(uint256 amount, uint256 fromBalance, uint256 fee) public {
        amount = bound(amount, 2, 30_000e18);
        fromBalance = bound(fromBalance, 0, amount - 1);
        fromBalance = fromBalance > 10_000e18 ? 10_000e18 : fromBalance;
        fee = bound(fee, 0, amount);
        uint256 borrowed = amount - fromBalance;

        MezoutRouter.Invoice memory inv = _invoice(amount, fee, keccak256(abi.encode("b", amount, fromBalance, fee)));
        bytes memory paySig = _signPayment(payerPk, inv, payer);
        MezoutRouter.BorrowAuth memory b = _borrowAuth(payerPk, payer, borrowed, address(router));
        MezoutRouter.PermitSig memory p = fromBalance > 0 ? _permit(payerPk, payer, fromBalance) : _noPermit();

        vm.prank(relayer);
        router.payWithBorrow(inv, _signInvoice(inv), payer, paySig, fromBalance, p, b);

        assertEq(musd.balanceOf(merchant), amount - fee);
        assertEq(musd.balanceOf(feeRecipient), fee);
        assertEq(musd.balanceOf(payer), 10_000e18 - fromBalance);
        assertEq(troveManager.debt(payer), 10_000e18 + borrowed);
        _assertRouterEmpty();
    }
}
