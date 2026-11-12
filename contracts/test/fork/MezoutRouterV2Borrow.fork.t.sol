// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MezoutRouter} from "../../src/MezoutRouter.sol";
import {IAggregatorV3} from "../../src/interfaces/mezo/IAggregatorV3.sol";
import {ITroveManager} from "../../src/interfaces/mezo/ITroveManager.sol";
import {IBorrowerOperationsSignatures} from "../../src/interfaces/mezo/IBorrowerOperationsSignatures.sol";
import {MezoTestnet} from "../utils/MezoTestnet.sol";

interface IBorrowerOperationsV2Proof {
    function openTrove(uint256 debtAmount, address upperHint, address lowerHint) external payable;
    function borrowingRate() external view returns (uint256);
}

interface IERC5267V2Proof {
    function eip712Domain()
        external
        view
        returns (bytes1, string memory, string memory, uint256, address, bytes32, uint256[] memory);
}

/// Borrow-to-pay against the DEPLOYED router v2 bytecode (0xe132…a431) on a Mezo testnet fork, with the real MUSD
/// protocol. Only two things are substituted: the BTC price precompile (Foundry cannot run it) and the router's
/// immutable `invoiceSigner` word, so the test can sign invoices without the platform key. Every other byte of v2
/// is what is on chain. The deployed v3 (0x7151…b3E6) is patched the same way for the front-running contrast.
///
/// v2 and v3 share the `payWithBorrow` ABI, so the current `MezoutRouter` type is used only as an ABI handle.
contract MezoutRouterV2BorrowForkTest is Test {
    uint256 internal constant FORK_BLOCK = 16_733_000;
    int256 internal constant PRICE = 80_000e18;

    address internal constant ROUTER_V2 = 0xe132f9a1c8dbc31015C3Cf4eE8706c9031bFa431;
    address internal constant ROUTER_V3 = 0x7151473F1300c2529A2eEFaA517684e974A9b3E6;

    bytes32 internal constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 internal constant WITHDRAW_MUSD_TYPEHASH =
        keccak256("WithdrawMUSD(uint256 amount,address borrower,address recipient,uint256 nonce,uint256 deadline)");

    IERC20 internal musd = IERC20(MezoTestnet.MUSD);
    IBorrowerOperationsSignatures internal bos =
        IBorrowerOperationsSignatures(MezoTestnet.BORROWER_OPERATIONS_SIGNATURES);
    ITroveManager internal troveManager = ITroveManager(MezoTestnet.TROVE_MANAGER);
    IBorrowerOperationsV2Proof internal bo = IBorrowerOperationsV2Proof(MezoTestnet.BORROWER_OPERATIONS);

    MezoutRouter internal v2 = MezoutRouter(payable(ROUTER_V2));
    MezoutRouter internal v3 = MezoutRouter(payable(ROUTER_V3));

    uint256 internal signerPk = 0xA11CE;
    uint256 internal payerPk = 0xB0B;
    address internal payer;
    address internal merchant = makeAddr("merchant");
    address internal relayer = makeAddr("relayer");
    address internal attacker = makeAddr("attacker");
    address internal feeRecipient;

    // Invoice: 1,000 MUSD with a 1% fee; the payer covers 200 from balance and borrows 800.
    uint256 internal constant AMOUNT = 1_000e18;
    uint256 internal constant FEE = 10e18;
    uint256 internal constant FROM_BALANCE = 200e18;
    uint256 internal constant BORROWED = AMOUNT - FROM_BALANCE;

    function setUp() public {
        vm.createSelectFork(vm.envOr("MEZO_RPC_URL", string("https://rpc.test.mezo.org")), FORK_BLOCK);
        _pinOracle(PRICE);
        payer = vm.addr(payerPk);

        _patchInvoiceSigner(ROUTER_V2);
        _patchInvoiceSigner(ROUTER_V3);
        feeRecipient = v2.feeRecipient();

        // A real trove: 0.1 BTC (8,000 MUSD at the pinned price) against 2,000 MUSD net debt.
        vm.deal(payer, 1e18);
        vm.prank(payer);
        bo.openTrove{value: 0.1e18}(2_000e18, address(0), address(0));
    }

    // ---------------------------------------------------------------- end to end

    function test_v2_borrowToPay_endToEnd() public {
        MezoutRouter.Invoice memory inv = _invoice("v2-borrow-e2e");
        bytes memory invSig = _sign(signerPk, v2.hashInvoice(inv));
        bytes memory paySig = _sign(payerPk, v2.hashPayment(inv, payer));
        MezoutRouter.PermitSig memory p = _permit(ROUTER_V2, FROM_BALANCE);
        (MezoutRouter.BorrowAuth memory b, uint256 signedBorrow, address signedRecipient) =
            _borrowAuth(BORROWED, ROUTER_V2);

        // Payer intent: the invoice the payer signed is the one the platform signed, and the borrow they
        // authorised is exactly the invoice minus what they pay from balance, sent to the router.
        assertEq(signedBorrow, inv.amount - FROM_BALANCE, "signed borrow != invoice - fromBalance");
        assertEq(signedRecipient, ROUTER_V2, "v2 borrow must name the router as recipient");
        assertEq(_recover(v2.hashPayment(inv, payer), paySig), payer, "payer signed this invoice");
        assertEq(_recover(v2.hashInvoice(inv), invSig), v2.invoiceSigner(), "platform signed this invoice");

        Snapshot memory s0 = _snap(ROUTER_V2);
        uint256 expectedDebtIncrease = BORROWED + BORROWED * bo.borrowingRate() / 1e18;

        vm.expectEmit(true, true, true, true, ROUTER_V2);
        emit MezoutRouter.Paid(
            inv.orderId, merchant, payer, AMOUNT, FEE, MezoutRouter.Method.BORROW, address(musd), FROM_BALANCE, BORROWED
        );
        vm.prank(relayer);
        v2.payWithBorrow(inv, invSig, payer, paySig, FROM_BALANCE, p, b);

        Snapshot memory s1 = _snap(ROUTER_V2);
        assertTrue(v2.paid(inv.orderId));
        assertEq(s1.merchant - s0.merchant, AMOUNT - FEE, "merchant net");
        assertEq(s1.feeRecipient - s0.feeRecipient, FEE, "fee");
        assertEq(s0.payerMusd - s1.payerMusd, FROM_BALANCE, "payer paid only fromBalance from wallet");
        assertEq(s1.routerMusd, 0, "router MUSD");
        assertEq(ROUTER_V2.balance, 0, "router BTC");
        assertEq(musd.allowance(payer, ROUTER_V2), 0, "no allowance left over");
        assertEq(bos.getNonce(payer), s0.nonce + 1, "borrow nonce used once");
        assertEq(s1.debt - s0.debt, expectedDebtIncrease, "debt += borrowed + 0.1% fee");
        assertEq(s1.coll, s0.coll, "collateral unchanged");
        assertLt(s1.icr, s0.icr);
        assertGe(s1.icr, v2.MIN_BORROW_ICR(), "ICR >= 160%");

        _log("v2 e2e", s0, s1);
    }

    /// The relayer cannot change how much is borrowed, who is paid, or the payer: every variant reverts.
    function test_v2_payerIntent_relayerCannotAlterBorrowOrInvoice() public {
        MezoutRouter.Invoice memory inv = _invoice("v2-borrow-intent");
        bytes memory invSig = _sign(signerPk, v2.hashInvoice(inv));
        bytes memory paySig = _sign(payerPk, v2.hashPayment(inv, payer));
        MezoutRouter.PermitSig memory p = _permit(ROUTER_V2, FROM_BALANCE);
        (MezoutRouter.BorrowAuth memory b,,) = _borrowAuth(BORROWED, ROUTER_V2);

        // Borrow more than signed (fromBalance 0 => borrow 1,000 with an 800 authorisation).
        vm.prank(relayer);
        vm.expectRevert(bytes("BorrowerOperationsSignatures: Invalid signature"));
        v2.payWithBorrow(inv, invSig, payer, paySig, 0, p, b);

        // Redirect payout to another merchant: the platform's invoice signature no longer matches.
        MezoutRouter.Invoice memory redirected = inv;
        redirected.merchant = relayer;
        vm.prank(relayer);
        vm.expectRevert(MezoutRouter.InvalidInvoiceSignature.selector);
        v2.payWithBorrow(redirected, invSig, payer, paySig, FROM_BALANCE, p, b);

        // A platform-signed invoice the payer never chose.
        MezoutRouter.Invoice memory other = _invoice("v2-borrow-other");
        bytes memory otherInvSig = _sign(signerPk, v2.hashInvoice(other));
        vm.prank(relayer);
        vm.expectRevert(MezoutRouter.InvalidPayerSignature.selector);
        v2.payWithBorrow(other, otherInvSig, payer, paySig, FROM_BALANCE, p, b);

        assertEq(bos.getNonce(payer), 0, "nothing borrowed");
        assertEq(musd.balanceOf(merchant), 0);
    }

    // ---------------------------------------------------------------- front-running

    /// v2: an attacker who copies the borrow authorisation from the mempool or the relay request and submits it first
    /// mints the borrowed MUSD into the router (the signed recipient), where nothing can ever move it. The payer's
    /// checkout then reverts. The payer can only finish by signing a second borrow, so the trove carries both.
    function test_v2_frontRun_strandsMusdInRouterAndBlocksCheckout() public {
        MezoutRouter.Invoice memory inv = _invoice("v2-borrow-front-run");
        bytes memory invSig = _sign(signerPk, v2.hashInvoice(inv));
        bytes memory paySig = _sign(payerPk, v2.hashPayment(inv, payer));
        MezoutRouter.PermitSig memory p = _permit(ROUTER_V2, FROM_BALANCE);
        (MezoutRouter.BorrowAuth memory b,,) = _borrowAuth(BORROWED, ROUTER_V2);
        Snapshot memory s0 = _snap(ROUTER_V2);
        uint256 oneBorrowDebt = BORROWED + BORROWED * bo.borrowingRate() / 1e18;

        // 1. Attacker submits the copied authorisation. Anyone may call withdrawMUSDWithSignature.
        uint256 attackerBefore = musd.balanceOf(attacker);
        vm.prank(attacker);
        bos.withdrawMUSDWithSignature(BORROWED, b.upperHint, b.lowerHint, payer, ROUTER_V2, b.signature, b.deadline);
        assertEq(musd.balanceOf(attacker), attackerBefore, "attacker gains nothing");
        assertEq(musd.balanceOf(ROUTER_V2), BORROWED, "MUSD minted into the router");
        assertEq(_snap(ROUTER_V2).debt - s0.debt, oneBorrowDebt, "payer already owes the borrow");

        // 2. The genuine checkout now fails: the borrow signature's nonce is spent.
        vm.prank(relayer);
        vm.expectRevert(bytes("BorrowerOperationsSignatures: Invalid signature"));
        v2.payWithBorrow(inv, invSig, payer, paySig, FROM_BALANCE, p, b);
        assertFalse(v2.paid(inv.orderId), "invoice still open");
        assertEq(musd.balanceOf(merchant), 0, "merchant unpaid");

        // 3. Recovery: the payer signs a fresh borrow and the same invoice completes...
        (MezoutRouter.BorrowAuth memory b2,,) = _borrowAuth(BORROWED, ROUTER_V2);
        vm.prank(relayer);
        v2.payWithBorrow(inv, invSig, payer, paySig, FROM_BALANCE, p, b2);

        // ...but the first 800 MUSD stays in the router: v2 only ever forwards balance deltas and has no sweep.
        Snapshot memory s1 = _snap(ROUTER_V2);
        assertEq(s1.merchant - s0.merchant, AMOUNT - FEE, "merchant net");
        assertEq(s1.routerMusd, BORROWED, "first borrow stranded in v2");
        assertEq(s1.debt - s0.debt, 2 * oneBorrowDebt, "payer owes both borrows");
        assertGe(s1.icr, v2.MIN_BORROW_ICR());

        // 4. A later borrow payment through v2 does not release it either.
        MezoutRouter.Invoice memory next = _invoice("v2-borrow-after");
        (MezoutRouter.BorrowAuth memory b3,,) = _borrowAuth(100e18 - 1, ROUTER_V2);
        vm.prank(relayer);
        v2.payWithBorrow(
            _setAmount(next, 100e18),
            _sign(signerPk, v2.hashInvoice(_setAmount(next, 100e18))),
            payer,
            _sign(payerPk, v2.hashPayment(_setAmount(next, 100e18), payer)),
            1,
            _permit(ROUTER_V2, 1),
            b3
        );
        assertEq(musd.balanceOf(ROUTER_V2), BORROWED, "still stranded");

        _log("v2 front-run", s0, s1);
    }

    /// v3 contrast, on the deployed v3 bytecode: the authorisation names the payer as recipient, so a copied borrow
    /// submitted first lands in the payer's wallet, and checkout still completes from it with one borrow of debt.
    function test_v3_frontRun_completesWithSingleBorrow() public {
        MezoutRouter.Invoice memory inv = _invoice("v3-borrow-front-run");
        bytes memory invSig = _sign(signerPk, v3.hashInvoice(inv));
        bytes memory paySig = _sign(payerPk, v3.hashPayment(inv, payer));
        MezoutRouter.PermitSig memory p = _permit(ROUTER_V3, AMOUNT);
        (MezoutRouter.BorrowAuth memory b,,) = _borrowAuth(BORROWED, payer);
        Snapshot memory s0 = _snap(ROUTER_V3);
        uint256 oneBorrowDebt = BORROWED + BORROWED * bo.borrowingRate() / 1e18;

        vm.prank(attacker);
        bos.withdrawMUSDWithSignature(BORROWED, b.upperHint, b.lowerHint, payer, payer, b.signature, b.deadline);

        vm.prank(relayer);
        v3.payWithBorrow(inv, invSig, payer, paySig, FROM_BALANCE, p, b);

        Snapshot memory s1 = _snap(ROUTER_V3);
        assertTrue(v3.paid(inv.orderId));
        assertEq(s1.merchant - s0.merchant, AMOUNT - FEE, "merchant net");
        assertEq(s1.routerMusd, 0, "nothing stranded");
        assertEq(s0.payerMusd - s1.payerMusd, FROM_BALANCE, "payer wallet net -fromBalance");
        assertEq(s1.debt - s0.debt, oneBorrowDebt, "one borrow of debt");
        assertEq(bos.getNonce(payer), s0.nonce + 1);
        assertGe(s1.icr, v3.MIN_BORROW_ICR());

        _log("v3 front-run", s0, s1);
    }

    // ---------------------------------------------------------------- helpers

    struct Snapshot {
        uint256 merchant;
        uint256 feeRecipient;
        uint256 payerMusd;
        uint256 routerMusd;
        uint256 debt;
        uint256 coll;
        uint256 icr;
        uint256 nonce;
    }

    function _snap(address router) internal view returns (Snapshot memory s) {
        s.merchant = musd.balanceOf(merchant);
        s.feeRecipient = musd.balanceOf(feeRecipient);
        s.payerMusd = musd.balanceOf(payer);
        s.routerMusd = musd.balanceOf(router);
        (uint256 coll, uint256 principal, uint256 interest,,,) = troveManager.getEntireDebtAndColl(payer);
        s.debt = principal + interest;
        s.coll = coll;
        s.icr = troveManager.getCurrentICR(payer, uint256(PRICE));
        s.nonce = bos.getNonce(payer);
    }

    function _log(string memory label, Snapshot memory s0, Snapshot memory s1) internal {
        emit log(label);
        emit log_named_decimal_uint("  debt before", s0.debt, 18);
        emit log_named_decimal_uint("  debt after ", s1.debt, 18);
        emit log_named_decimal_uint("  ICR before %", s0.icr * 100, 18);
        emit log_named_decimal_uint("  ICR after  %", s1.icr * 100, 18);
        emit log_named_decimal_uint("  merchant +", s1.merchant - s0.merchant, 18);
        emit log_named_decimal_uint("  router MUSD", s1.routerMusd, 18);
    }

    /// Replaces the 32-byte immutable word holding the platform invoice signer with the test signer.
    function _patchInvoiceSigner(address router) internal {
        address real = MezoutRouter(payable(router)).invoiceSigner();
        address feeBefore = MezoutRouter(payable(router)).feeRecipient();
        bytes memory code = router.code;
        bytes32 needle = bytes32(uint256(uint160(real)));
        bytes32 repl = bytes32(uint256(uint160(vm.addr(signerPk))));
        uint256 hits;
        for (uint256 i; i + 32 <= code.length; ++i) {
            bytes32 w;
            assembly {
                w := mload(add(add(code, 32), i))
            }
            if (w == needle) {
                assembly {
                    mstore(add(add(code, 32), i), repl)
                }
                ++hits;
                i += 31;
            }
        }
        assertGt(hits, 0, "invoiceSigner immutable not found");
        vm.etch(router, code);
        assertEq(MezoutRouter(payable(router)).invoiceSigner(), vm.addr(signerPk));
        assertEq(MezoutRouter(payable(router)).feeRecipient(), feeBefore, "other immutables untouched");
    }

    function _pinOracle(int256 answer) internal {
        vm.mockCall(MezoTestnet.BTC_ORACLE, abi.encodeCall(IAggregatorV3.decimals, ()), abi.encode(uint8(18)));
        vm.mockCall(
            MezoTestnet.BTC_ORACLE,
            abi.encodeCall(IAggregatorV3.latestRoundData, ()),
            abi.encode(uint80(1), answer, block.timestamp, block.timestamp, uint80(1))
        );
    }

    function _invoice(bytes32 orderId) internal view returns (MezoutRouter.Invoice memory) {
        return MezoutRouter.Invoice({
            merchant: merchant, amount: AMOUNT, fee: FEE, orderId: orderId, expiry: uint64(block.timestamp + 1 hours)
        });
    }

    function _setAmount(MezoutRouter.Invoice memory inv, uint256 amount)
        internal
        pure
        returns (MezoutRouter.Invoice memory)
    {
        inv.amount = amount;
        inv.fee = 0;
        return inv;
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _recover(bytes32 digest, bytes memory sig) internal pure returns (address) {
        return ECDSA.recover(digest, sig);
    }

    function _domain(address target) internal view returns (bytes32) {
        (, string memory name, string memory version, uint256 chainId, address verifying,,) =
            IERC5267V2Proof(target).eip712Domain();
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

    function _permit(address spender, uint256 value) internal view returns (MezoutRouter.PermitSig memory p) {
        p.deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(PERMIT_TYPEHASH, payer, spender, value, IERC20Permit(address(musd)).nonces(payer), p.deadline)
        );
        (p.v, p.r, p.s) = vm.sign(payerPk, keccak256(abi.encodePacked("\x19\x01", _domain(address(musd)), structHash)));
    }

    function _borrowAuth(uint256 amount, address recipient)
        internal
        view
        returns (MezoutRouter.BorrowAuth memory a, uint256 signedAmount, address signedRecipient)
    {
        a.deadline = block.timestamp + 1 hours;
        bytes32 structHash =
            keccak256(abi.encode(WITHDRAW_MUSD_TYPEHASH, amount, payer, recipient, bos.getNonce(payer), a.deadline));
        a.signature = _sign(payerPk, keccak256(abi.encodePacked("\x19\x01", _domain(address(bos)), structHash)));
        return (a, amount, recipient);
    }
}
