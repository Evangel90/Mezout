// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MezoutRouter} from "../../src/MezoutRouter.sol";
import {MockMUSD} from "../mocks/MockMUSD.sol";
import {MockERC20Permit} from "../mocks/MockERC20Permit.sol";
import {MockTigrisFactory, MockTigrisPool} from "../mocks/MockTigris.sol";

contract MezoutRouterSwapTest is Test {
    bytes32 internal constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    // MEZO sorts below MUSD and BTC above it, so both pool orientations are exercised.
    address internal constant MEZO_AT = 0x0000000000000000000000000000000000001001;
    address internal constant BTC_AT = 0xFFfffFFfFFfffFfFffFFfFfFfFffFfffFFFFFf01;

    MockMUSD internal musd;
    MockERC20Permit internal mezo;
    MockERC20Permit internal btc;
    MockTigrisFactory internal factory;
    MockTigrisPool internal mezoPool;
    MockTigrisPool internal btcPool;
    MezoutRouter internal router;

    uint256 internal signerPk = 0xA11CE;
    uint256 internal payerPk = 0xB0B;
    address internal payer;
    address internal merchant = makeAddr("merchant");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal relayer = makeAddr("relayer");

    function setUp() public {
        payer = vm.addr(payerPk);
        musd = new MockMUSD();
        deployCodeTo("MockERC20Permit.sol:MockERC20Permit", abi.encode("MEZO"), MEZO_AT);
        deployCodeTo("MockERC20Permit.sol:MockERC20Permit", abi.encode("BTC"), BTC_AT);
        mezo = MockERC20Permit(MEZO_AT);
        btc = MockERC20Permit(BTC_AT);
        factory = new MockTigrisFactory();
        router = new MezoutRouter(
            address(musd),
            makeAddr("bos"),
            makeAddr("troveManager"),
            makeAddr("priceFeed"),
            vm.addr(signerPk),
            feeRecipient,
            address(factory),
            address(btc),
            address(mezo)
        );

        // 1 MEZO = 0.25 MUSD; 1 BTC = 80,000 MUSD.
        mezoPool = _seedPool(mezo, 400_000e18, 100_000e18);
        btcPool = _seedPool(btc, 12.5e18, 1_000_000e18);
        assertEq(mezoPool.token0(), address(mezo));
        assertEq(btcPool.token1(), address(btc));

        mezo.mint(payer, 1_000_000e18);
        btc.mint(payer, 10e18);
    }

    // ---------------------------------------------------------------- helpers

    function _seedPool(MockERC20Permit token, uint256 tokenReserve, uint256 musdReserve)
        internal
        returns (MockTigrisPool pool)
    {
        pool = factory.createPool(address(token), address(musd));
        token.mint(address(pool), tokenReserve);
        musd.mint(address(pool), musdReserve);
        pool.sync();
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

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _limit(uint256 maxAmountIn) internal view returns (MezoutRouter.SwapLimit memory) {
        return MezoutRouter.SwapLimit({maxAmountIn: maxAmountIn, deadline: block.timestamp + 2 minutes});
    }

    function _permit(MockERC20Permit token, uint256 value) internal view returns (MezoutRouter.PermitSig memory p) {
        p.deadline = block.timestamp + 1 hours;
        bytes32 structHash =
            keccak256(abi.encode(PERMIT_TYPEHASH, payer, address(router), value, token.nonces(payer), p.deadline));
        (p.v, p.r, p.s) =
            vm.sign(payerPk, keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash)));
    }

    function _noPermit() internal pure returns (MezoutRouter.PermitSig memory p) {}

    /// Quote plus 1% slippage, as the checkout does.
    function _capFor(MockERC20Permit token, uint256 amountOut) internal view returns (uint256) {
        return router.quoteSwapIn(address(token), amountOut) * 101 / 100;
    }

    function _payMEZO(MezoutRouter.Invoice memory inv, MezoutRouter.SwapLimit memory limit) internal {
        bytes memory paySig = _sign(payerPk, router.hashSwapPayment(inv, payer, address(mezo), limit));
        bytes memory invSig = _sign(signerPk, router.hashInvoice(inv));
        MezoutRouter.PermitSig memory p = _permit(mezo, limit.maxAmountIn);
        vm.prank(relayer);
        router.payWithMEZO(inv, invSig, payer, paySig, limit, p);
    }

    function _assertRouterEmpty() internal view {
        assertEq(musd.balanceOf(address(router)), 0, "router holds MUSD");
        assertEq(mezo.balanceOf(address(router)), 0, "router holds MEZO");
        assertEq(btc.balanceOf(address(router)), 0, "router holds BTC");
        assertEq(address(router).balance, 0, "router holds native BTC");
    }

    // ---------------------------------------------------------------- happy paths

    function test_payWithMEZO_relayed_paysExactAmountAndChargesOnlyTheQuote() public {
        MezoutRouter.Invoice memory inv = _invoice(100e18, 1e18, "mezo-1");
        uint256 quote = router.quoteSwapIn(address(mezo), 100e18);
        MezoutRouter.SwapLimit memory limit = _limit(quote * 101 / 100);
        uint256 payerBefore = mezo.balanceOf(payer);

        vm.expectEmit(address(router));
        emit MezoutRouter.Paid(
            inv.orderId, merchant, payer, 100e18, 1e18, MezoutRouter.Method.MEZO, address(mezo), quote, 0
        );
        _payMEZO(inv, limit);

        assertEq(musd.balanceOf(merchant), 99e18);
        assertEq(musd.balanceOf(feeRecipient), 1e18);
        assertEq(payerBefore - mezo.balanceOf(payer), quote, "payer charged more than the quote");
        assertTrue(router.paid("mezo-1"));
        _assertRouterEmpty();
    }

    function test_payWithBTC_relayed_musdIsToken0() public {
        MezoutRouter.Invoice memory inv = _invoice(250e18, 0, "btc-1");
        uint256 quote = router.quoteSwapIn(address(btc), 250e18);
        // About 250 / 80,000 BTC plus the 0.04% fee and price impact.
        assertApproxEqRel(quote, 0.003126e18, 0.001e18);
        MezoutRouter.SwapLimit memory limit = _limit(quote * 101 / 100);
        bytes memory paySig = _sign(payerPk, router.hashSwapPayment(inv, payer, address(btc), limit));
        bytes memory invSig = _sign(signerPk, router.hashInvoice(inv));
        MezoutRouter.PermitSig memory p = _permit(btc, limit.maxAmountIn);

        vm.prank(relayer);
        router.payWithBTC(inv, invSig, payer, paySig, limit, p);

        assertEq(musd.balanceOf(merchant), 250e18);
        assertEq(btc.balanceOf(payer), 10e18 - quote);
        _assertRouterEmpty();
    }

    function test_payWithMEZO_directWithApprovalNeedsNoPayerSig() public {
        MezoutRouter.Invoice memory inv = _invoice(10e18, 0, "mezo-direct");
        MezoutRouter.SwapLimit memory limit = _limit(_capFor(mezo, 10e18));
        bytes memory invSig = _sign(signerPk, router.hashInvoice(inv));
        vm.startPrank(payer);
        mezo.approve(address(router), limit.maxAmountIn);
        router.payWithMEZO(inv, invSig, payer, "", limit, _noPermit());
        vm.stopPrank();
        assertEq(musd.balanceOf(merchant), 10e18);
        _assertRouterEmpty();
    }

    function test_payWithMEZO_frontRunPermitStillPays() public {
        MezoutRouter.Invoice memory inv = _invoice(10e18, 0, "mezo-frontrun");
        MezoutRouter.SwapLimit memory limit = _limit(_capFor(mezo, 10e18));
        MezoutRouter.PermitSig memory p = _permit(mezo, limit.maxAmountIn);
        mezo.permit(payer, address(router), limit.maxAmountIn, p.deadline, p.v, p.r, p.s);

        bytes memory paySig = _sign(payerPk, router.hashSwapPayment(inv, payer, address(mezo), limit));
        bytes memory invSig = _sign(signerPk, router.hashInvoice(inv));
        vm.prank(relayer);
        router.payWithMEZO(inv, invSig, payer, paySig, limit, p);
        assertEq(musd.balanceOf(merchant), 10e18);
    }

    // ---------------------------------------------------------------- slippage and deadline

    function test_revert_slippageCapBelowQuote() public {
        MezoutRouter.Invoice memory inv = _invoice(100e18, 0, "mezo-slip");
        uint256 quote = router.quoteSwapIn(address(mezo), 100e18);
        MezoutRouter.SwapLimit memory limit = _limit(quote - 1);
        bytes memory paySig = _sign(payerPk, router.hashSwapPayment(inv, payer, address(mezo), limit));
        bytes memory invSig = _sign(signerPk, router.hashInvoice(inv));
        MezoutRouter.PermitSig memory p = _permit(mezo, limit.maxAmountIn);

        vm.expectRevert(abi.encodeWithSelector(MezoutRouter.SlippageExceeded.selector, quote, quote - 1));
        vm.prank(relayer);
        router.payWithMEZO(inv, invSig, payer, paySig, limit, p);
    }

    function test_revert_priceMovedPastCap() public {
        MezoutRouter.Invoice memory inv = _invoice(1_000e18, 0, "mezo-moved");
        MezoutRouter.SwapLimit memory limit = _limit(_capFor(mezo, 1_000e18));
        bytes memory paySig = _sign(payerPk, router.hashSwapPayment(inv, payer, address(mezo), limit));
        bytes memory invSig = _sign(signerPk, router.hashInvoice(inv));
        MezoutRouter.PermitSig memory p = _permit(mezo, limit.maxAmountIn);

        // Someone sells 10,000 MUSD of MEZO into the pool after the quote: MEZO is now cheaper.
        _sellIntoPool(mezoPool, mezo, 40_000e18);

        vm.expectPartialRevert(MezoutRouter.SlippageExceeded.selector);
        vm.prank(relayer);
        router.payWithMEZO(inv, invSig, payer, paySig, limit, p);
    }

    function test_priceMovedWithinCapChargesTheNewPrice() public {
        MezoutRouter.Invoice memory inv = _invoice(1_000e18, 0, "mezo-moved-ok");
        uint256 quoteBefore = router.quoteSwapIn(address(mezo), 1_000e18);
        MezoutRouter.SwapLimit memory limit = _limit(quoteBefore * 105 / 100);

        _sellIntoPool(mezoPool, mezo, 4_000e18);
        uint256 quoteAfter = router.quoteSwapIn(address(mezo), 1_000e18);
        assertGt(quoteAfter, quoteBefore);

        uint256 payerBefore = mezo.balanceOf(payer);
        _payMEZO(inv, limit);
        assertEq(payerBefore - mezo.balanceOf(payer), quoteAfter);
        assertEq(musd.balanceOf(merchant), 1_000e18);
    }

    function test_revert_quoteExpired() public {
        MezoutRouter.Invoice memory inv = _invoice(10e18, 0, "mezo-late");
        MezoutRouter.SwapLimit memory limit = _limit(_capFor(mezo, 10e18));
        bytes memory paySig = _sign(payerPk, router.hashSwapPayment(inv, payer, address(mezo), limit));
        bytes memory invSig = _sign(signerPk, router.hashInvoice(inv));
        MezoutRouter.PermitSig memory p = _permit(mezo, limit.maxAmountIn);

        vm.warp(limit.deadline + 1);
        vm.expectRevert(MezoutRouter.QuoteExpired.selector);
        vm.prank(relayer);
        router.payWithMEZO(inv, invSig, payer, paySig, limit, p);
    }

    // ---------------------------------------------------------------- relayer cannot change the payer's terms

    function test_revert_relayerRaisesSlippageCap() public {
        MezoutRouter.Invoice memory inv = _invoice(10e18, 0, "mezo-raise");
        MezoutRouter.SwapLimit memory signed = _limit(_capFor(mezo, 10e18));
        bytes memory paySig = _sign(payerPk, router.hashSwapPayment(inv, payer, address(mezo), signed));
        bytes memory invSig = _sign(signerPk, router.hashInvoice(inv));

        // The payer also holds a large standing allowance, so only the signed cap protects them.
        vm.prank(payer);
        mezo.approve(address(router), type(uint256).max);

        MezoutRouter.SwapLimit memory raised = signed;
        raised.maxAmountIn = signed.maxAmountIn * 10;
        vm.expectRevert(MezoutRouter.InvalidPayerSignature.selector);
        vm.prank(relayer);
        router.payWithMEZO(inv, invSig, payer, paySig, raised, _noPermit());
    }

    function test_revert_mezoSignatureUsedForBTC() public {
        MezoutRouter.Invoice memory inv = _invoice(10e18, 0, "mezo-as-btc");
        MezoutRouter.SwapLimit memory limit = _limit(1e18);
        bytes memory paySig = _sign(payerPk, router.hashSwapPayment(inv, payer, address(mezo), limit));
        bytes memory invSig = _sign(signerPk, router.hashInvoice(inv));
        vm.prank(payer);
        btc.approve(address(router), 1e18);

        vm.expectRevert(MezoutRouter.InvalidPayerSignature.selector);
        vm.prank(relayer);
        router.payWithBTC(inv, invSig, payer, paySig, limit, _noPermit());
    }

    function test_revert_plainPaymentSignatureNotAcceptedForSwap() public {
        MezoutRouter.Invoice memory inv = _invoice(10e18, 0, "mezo-plain");
        MezoutRouter.SwapLimit memory limit = _limit(_capFor(mezo, 10e18));
        bytes memory paySig = _sign(payerPk, router.hashPayment(inv, payer));
        bytes memory invSig = _sign(signerPk, router.hashInvoice(inv));
        MezoutRouter.PermitSig memory p = _permit(mezo, limit.maxAmountIn);

        vm.expectRevert(MezoutRouter.InvalidPayerSignature.selector);
        vm.prank(relayer);
        router.payWithMEZO(inv, invSig, payer, paySig, limit, p);
    }

    function test_revert_paySwapTwice() public {
        MezoutRouter.Invoice memory inv = _invoice(10e18, 0, "mezo-twice");
        MezoutRouter.SwapLimit memory limit = _limit(_capFor(mezo, 10e18));
        _payMEZO(inv, limit);
        bytes memory paySig = _sign(payerPk, router.hashSwapPayment(inv, payer, address(mezo), limit));
        bytes memory invSig = _sign(signerPk, router.hashInvoice(inv));
        vm.expectRevert(MezoutRouter.InvoiceAlreadyPaid.selector);
        vm.prank(relayer);
        router.payWithMEZO(inv, invSig, payer, paySig, limit, _noPermit());
    }

    // ---------------------------------------------------------------- pool edge cases

    function test_revert_noPool() public {
        MockTigrisFactory empty = new MockTigrisFactory();
        MezoutRouter bare = new MezoutRouter(
            address(musd),
            makeAddr("bos"),
            makeAddr("troveManager"),
            makeAddr("priceFeed"),
            vm.addr(signerPk),
            feeRecipient,
            address(empty),
            address(btc),
            address(mezo)
        );
        vm.expectRevert(MezoutRouter.NoPool.selector);
        bare.quoteSwapIn(address(mezo), 1e18);
    }

    function test_revert_amountAtLeastPoolReserve() public {
        vm.expectRevert(MezoutRouter.InsufficientLiquidity.selector);
        router.quoteSwapIn(address(mezo), 100_000e18);
    }

    function test_zeroFeePool() public {
        factory.setFee(0);
        MezoutRouter.Invoice memory inv = _invoice(50e18, 0, "mezo-nofee");
        _payMEZO(inv, _limit(_capFor(mezo, 50e18)));
        assertEq(musd.balanceOf(merchant), 50e18);
        _assertRouterEmpty();
    }

    /// The quote is the least input the pool accepts for exactly `amountOut`, for any reserves and fee up to 3%.
    function testFuzz_quoteIsExactMinimum(uint256 reserveIn, uint256 reserveOut, uint256 amountOut, uint256 fee)
        public
    {
        reserveIn = bound(reserveIn, 1e9, 1e30);
        reserveOut = bound(reserveOut, 1e9, 1e30);
        amountOut = bound(amountOut, 1, reserveOut - 1);
        fee = bound(fee, 0, 300);
        factory.setFee(fee);
        MockTigrisPool pool = _resetPool(mezoPool, mezo, reserveIn, reserveOut);

        uint256 amountIn = router.quoteSwapIn(address(mezo), amountOut);
        vm.assume(amountIn <= 1e36);
        assertTrue(_passesK(reserveIn, reserveOut, amountIn, amountOut, fee), "quote rejected by the pool");
        assertFalse(_passesK(reserveIn, reserveOut, amountIn - 1, amountOut, fee), "quote is not the minimum");

        // And the real swap delivers exactly amountOut for it.
        mezo.mint(address(pool), amountIn);
        pool.swap(0, amountOut, address(0xD00D), "");
        assertEq(musd.balanceOf(address(0xD00D)), amountOut);
    }

    function testFuzz_payWithMEZO_exactPayout(uint256 amount) public {
        amount = bound(amount, 1, 50_000e18);
        MezoutRouter.Invoice memory inv = _invoice(amount, 0, keccak256(abi.encode(amount)));
        _payMEZO(inv, _limit(_capFor(mezo, amount) + 1));
        assertEq(musd.balanceOf(merchant), amount);
        _assertRouterEmpty();
    }

    function _passesK(uint256 rIn, uint256 rOut, uint256 amountIn, uint256 amountOut, uint256 fee)
        internal
        pure
        returns (bool)
    {
        uint256 net = amountIn - amountIn * fee / 10_000;
        // (rIn + net) * (rOut - amountOut) >= rIn * rOut, compared without overflow.
        (uint256 hi, uint256 lo) = _mul512(rIn + net, rOut - amountOut);
        (uint256 hiK, uint256 loK) = _mul512(rIn, rOut);
        return hi > hiK || (hi == hiK && lo >= loK);
    }

    function _mul512(uint256 a, uint256 b) internal pure returns (uint256 hi, uint256 lo) {
        unchecked {
            lo = a * b;
            uint256 mm = mulmod(a, b, type(uint256).max);
            hi = mm - lo - (mm < lo ? 1 : 0);
        }
    }

    function _resetPool(MockTigrisPool pool, MockERC20Permit token, uint256 tokenReserve, uint256 musdReserve)
        internal
        returns (MockTigrisPool)
    {
        deal(address(token), address(pool), tokenReserve);
        deal(address(musd), address(pool), musdReserve);
        pool.sync();
        return pool;
    }

    function _sellIntoPool(MockTigrisPool pool, MockERC20Permit token, uint256 amountIn) internal {
        (uint256 r0, uint256 r1,) = pool.getReserves();
        bool tokenIs0 = pool.token0() == address(token);
        (uint256 rIn, uint256 rOut) = tokenIs0 ? (r0, r1) : (r1, r0);
        uint256 net = amountIn - amountIn * factory.fee() / 10_000;
        uint256 out = net * rOut / (rIn + net);
        token.mint(address(pool), amountIn);
        pool.swap(tokenIs0 ? 0 : out, tokenIs0 ? out : 0, address(0xBEEF), "");
    }
}
