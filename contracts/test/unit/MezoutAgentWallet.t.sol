// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ERC4337Utils} from "@openzeppelin/contracts/account/utils/draft-ERC4337Utils.sol";
import {Execution} from "@openzeppelin/contracts/account/utils/draft-ERC7579Utils.sol";
import {MezoutRouter} from "../../src/MezoutRouter.sol";
import {MezoutAgentWallet} from "../../src/agent/MezoutAgentWallet.sol";
import {MezoutAgentWalletFactory} from "../../src/agent/MezoutAgentWalletFactory.sol";
import {MezoutAccount} from "../../src/account/MezoutAccount.sol";
import {MezoutAccountFactory} from "../../src/account/MezoutAccountFactory.sol";
import {MockMUSD} from "../mocks/MockMUSD.sol";
import {HookedMUSD, MaliciousMerchant, FakeRouter} from "../mocks/MockAgentAttackers.sol";
import {Passkey} from "../utils/Passkey.sol";

/// Attacker-first tests for the agent wallet: the agent key, a relayer, a merchant and a stranger each try to move the
/// owner's MUSD outside the limits.
contract MezoutAgentWalletTest is Test {
    uint256 internal constant DAY = 1 days;
    // 14 Nov 2026 12:00 UTC.
    uint256 internal constant NOON = 1_794_657_600;

    MockMUSD internal musd;
    MezoutRouter internal router;
    MezoutAgentWalletFactory internal factory;
    MezoutAgentWallet internal wallet;

    uint256 internal signerPk = 0xA11CE;
    uint256 internal agentPk = 0xA6E7;
    uint256 internal strangerPk = 0xBAD;
    address internal signer;
    address internal agent;
    address internal stranger;
    address internal owner = makeAddr("owner");
    address internal merchant = makeAddr("merchant");
    address internal otherMerchant = makeAddr("otherMerchant");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal relayer = makeAddr("relayer");

    uint256 internal orderSeq;

    function setUp() public {
        vm.warp(NOON);
        signer = vm.addr(signerPk);
        agent = vm.addr(agentPk);
        stranger = vm.addr(strangerPk);
        musd = new MockMUSD();
        router = _router(address(musd));
        factory = new MezoutAgentWalletFactory(address(router));
        wallet = MezoutAgentWallet(factory.createWallet(owner, bytes32(0)));
        musd.mint(address(wallet), 1_000e18);
        _approve(agent, 10e18, 25e18, uint64(block.timestamp + 30 days), new address[](0));
    }

    // ---------------------------------------------------------------- helpers

    function _router(address token) internal returns (MezoutRouter) {
        return new MezoutRouter(
            token,
            makeAddr("bos"),
            makeAddr("troveManager"),
            makeAddr("priceFeed"),
            signer,
            feeRecipient,
            makeAddr("tigrisFactory"),
            makeAddr("btc"),
            makeAddr("mezo")
        );
    }

    function _approve(address who, uint128 perPayment, uint128 perDay, uint64 until, address[] memory merchants)
        internal
    {
        vm.prank(owner);
        wallet.approveAgent(who, perPayment, perDay, until, merchants);
    }

    function _invoice(address to, uint256 amount, uint256 fee) internal returns (MezoutRouter.Invoice memory) {
        return MezoutRouter.Invoice({
            merchant: to,
            amount: amount,
            fee: fee,
            orderId: keccak256(abi.encode("order", ++orderSeq)),
            expiry: uint64(block.timestamp + 1 hours)
        });
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _invSig(MezoutRouter r, MezoutRouter.Invoice memory inv) internal view returns (bytes memory) {
        return _sign(signerPk, r.hashInvoice(inv));
    }

    function _agentSig(uint256 pk, MezoutRouter r, MezoutRouter.Invoice memory inv, address w)
        internal
        view
        returns (bytes memory)
    {
        return _sign(pk, r.hashPayment(inv, w));
    }

    /// Relays a payment the agent signed, as Mezout's relayer would.
    function _relay(MezoutRouter.Invoice memory inv) internal {
        bytes memory invSig = _invSig(router, inv);
        bytes memory aSig = _agentSig(agentPk, router, inv, address(wallet));
        vm.prank(relayer);
        wallet.pay(inv, invSig, agent, aSig);
    }

    function _expectRelayRevert(MezoutRouter.Invoice memory inv, bytes memory err) internal {
        bytes memory invSig = _invSig(router, inv);
        bytes memory aSig = _agentSig(agentPk, router, inv, address(wallet));
        vm.expectRevert(err);
        vm.prank(relayer);
        wallet.pay(inv, invSig, agent, aSig);
    }

    function _today() internal view returns (uint256) {
        return block.timestamp / DAY;
    }

    // ---------------------------------------------------------------- happy paths

    function test_pay_relayed_paysMerchantAndFeeExactly() public {
        MezoutRouter.Invoice memory inv = _invoice(merchant, 10e18, 0.1e18);
        vm.expectEmit(address(wallet));
        emit MezoutAgentWallet.AgentPaid(agent, inv.orderId, merchant, 10e18, 10e18);
        _relay(inv);

        assertEq(musd.balanceOf(merchant), 9.9e18);
        assertEq(musd.balanceOf(feeRecipient), 0.1e18);
        assertEq(musd.balanceOf(address(wallet)), 990e18);
        assertEq(musd.balanceOf(relayer), 0);
        assertEq(musd.allowance(address(wallet), address(router)), 0, "allowance left on router");
        assertEq(wallet.spentOnDay(agent, _today()), 10e18);
        assertEq(wallet.remainingToday(agent), 15e18);
        assertTrue(router.paid(inv.orderId));
    }

    function test_pay_agentSubmitsItselfWithoutSignature() public {
        MezoutRouter.Invoice memory inv = _invoice(merchant, 5e18, 0);
        bytes memory invSig = _invSig(router, inv);
        vm.prank(agent);
        wallet.pay(inv, invSig, agent, "");
        assertEq(musd.balanceOf(merchant), 5e18);
    }

    function test_pay_routerEventNamesWalletAsPayer() public {
        MezoutRouter.Invoice memory inv = _invoice(merchant, 1e18, 0);
        vm.expectEmit(address(router));
        emit MezoutRouter.Paid(
            inv.orderId, merchant, address(wallet), 1e18, 0, MezoutRouter.Method.MUSD, address(musd), 1e18, 0
        );
        _relay(inv);
    }

    // ---------------------------------------------------------------- limits

    function test_revert_overPerPaymentLimit() public {
        MezoutRouter.Invoice memory inv = _invoice(merchant, 10e18 + 1, 0);
        _expectRelayRevert(inv, abi.encodeWithSelector(MezoutAgentWallet.OverPaymentLimit.selector, 10e18 + 1, 10e18));
    }

    function test_revert_overDailyLimitAcrossPayments() public {
        _relay(_invoice(merchant, 10e18, 0));
        _relay(_invoice(merchant, 10e18, 0));
        // 20 of 25 spent; 5 more is fine, then one wei more is not.
        _relay(_invoice(merchant, 5e18, 0));
        _expectRelayRevert(
            _invoice(merchant, 1, 0),
            abi.encodeWithSelector(MezoutAgentWallet.OverDailyLimit.selector, 25e18 + 1, 25e18)
        );
        assertEq(wallet.remainingToday(agent), 0);
        assertEq(musd.balanceOf(merchant), 25e18);
    }

    function test_feeCountsTowardLimits() public {
        // The wallet spends the full invoice amount, fee included.
        _expectRelayRevert(
            _invoice(merchant, 10e18 + 1, 1e18),
            abi.encodeWithSelector(MezoutAgentWallet.OverPaymentLimit.selector, 10e18 + 1, 10e18)
        );
    }

    function test_dayBoundary_calendarUtcDayResetsAtMidnight() public {
        uint256 midnight = (_today() + 1) * DAY;
        vm.warp(midnight - 1); // 23:59:59
        _relay(_invoice(merchant, 10e18, 0));
        _relay(_invoice(merchant, 10e18, 0));
        _relay(_invoice(merchant, 5e18, 0));
        _expectRelayRevert(
            _invoice(merchant, 1e18, 0), abi.encodeWithSelector(MezoutAgentWallet.OverDailyLimit.selector, 26e18, 25e18)
        );

        vm.warp(midnight); // 00:00:00, one second later: a new day's budget.
        assertEq(wallet.remainingToday(agent), 25e18);
        _relay(_invoice(merchant, 10e18, 0));
        assertEq(wallet.spentOnDay(agent, midnight / DAY), 10e18);
        assertEq(wallet.spentOnDay(agent, midnight / DAY - 1), 25e18);
    }

    /// The documented worst case of a calendar day: at most 2x the daily cap in any 24 hours, never more.
    function test_dayBoundary_worstCaseIsTwoDailyCapsIn24Hours() public {
        uint256 midnight = (_today() + 1) * DAY;
        vm.warp(midnight - 1 hours);
        for (uint256 i; i < 3; ++i) {
            _relay(_invoice(merchant, i == 2 ? 5e18 : 10e18, 0));
        }
        vm.warp(midnight + 1 hours);
        for (uint256 i; i < 3; ++i) {
            _relay(_invoice(merchant, i == 2 ? 5e18 : 10e18, 0));
        }
        _expectRelayRevert(
            _invoice(merchant, 1, 0),
            abi.encodeWithSelector(MezoutAgentWallet.OverDailyLimit.selector, 25e18 + 1, 25e18)
        );
        assertEq(musd.balanceOf(merchant), 50e18);
    }

    function test_reapprovalKeepsTodaysSpending() public {
        _relay(_invoice(merchant, 10e18, 0));
        _relay(_invoice(merchant, 10e18, 0));
        // Lowering the cap below what is already spent blocks the rest of the day.
        _approve(agent, 5e18, 15e18, uint64(block.timestamp + 1 days), new address[](0));
        _expectRelayRevert(
            _invoice(merchant, 1e18, 0), abi.encodeWithSelector(MezoutAgentWallet.OverDailyLimit.selector, 21e18, 15e18)
        );
        assertEq(wallet.remainingToday(agent), 0);
    }

    function test_insufficientBalance_revertsAndRecordsNothing() public {
        vm.prank(owner);
        wallet.withdraw(musd, owner, 995e18);
        MezoutRouter.Invoice memory inv = _invoice(merchant, 10e18, 0);
        _expectRelayRevert(
            inv, abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, address(wallet), 5e18, 10e18)
        );
        assertEq(wallet.spentOnDay(agent, _today()), 0);
        assertFalse(router.paid(inv.orderId));
    }

    function testFuzz_neverSpendsMoreThanCapsPerDay(uint96[12] memory amounts, uint8[12] memory hoursAhead) public {
        uint256 day = _today();
        uint256 spentDay;
        for (uint256 i; i < amounts.length; ++i) {
            vm.warp(block.timestamp + uint256(hoursAhead[i] % 12) * 1 hours);
            if (_today() != day) {
                day = _today();
                spentDay = 0;
            }
            uint256 amount = bound(amounts[i], 1, 12e18);
            MezoutRouter.Invoice memory inv = _invoice(merchant, amount, 0);
            bytes memory invSig = _invSig(router, inv);
            bytes memory aSig = _agentSig(agentPk, router, inv, address(wallet));
            vm.prank(relayer);
            try wallet.pay(inv, invSig, agent, aSig) {
                spentDay += amount;
                assertLe(amount, 10e18, "paid over the per-payment cap");
            } catch {}
            assertLe(spentDay, 25e18, "paid over the daily cap");
            assertEq(wallet.spentOnDay(agent, day), spentDay);
        }
        assertEq(musd.balanceOf(address(wallet)) + musd.balanceOf(merchant), 1_000e18);
    }

    // ---------------------------------------------------------------- merchants

    function test_allowlist_onlyListedMerchants() public {
        address[] memory list = new address[](1);
        list[0] = merchant;
        _approve(agent, 10e18, 25e18, uint64(block.timestamp + 1 days), list);
        _relay(_invoice(merchant, 1e18, 0));
        _expectRelayRevert(
            _invoice(otherMerchant, 1e18, 0), abi.encodeWithSelector(MezoutAgentWallet.MerchantNotAllowed.selector)
        );
        assertTrue(wallet.canPayMerchant(agent, merchant));
        assertFalse(wallet.canPayMerchant(agent, otherMerchant));
    }

    function test_allowlist_freshApprovalDoesNotInheritOldList() public {
        address[] memory list = new address[](1);
        list[0] = merchant;
        _approve(agent, 10e18, 25e18, uint64(block.timestamp + 1 days), list);
        list[0] = otherMerchant;
        _approve(agent, 10e18, 25e18, uint64(block.timestamp + 1 days), list);
        _expectRelayRevert(
            _invoice(merchant, 1e18, 0), abi.encodeWithSelector(MezoutAgentWallet.MerchantNotAllowed.selector)
        );
        _relay(_invoice(otherMerchant, 1e18, 0));
    }

    /// The agent registers as a Mezout merchant itself and gets a genuinely signed invoice paying its own key.
    function test_attack_agentPaysItself() public {
        _expectRelayRevert(
            _invoice(agent, 1e18, 0), abi.encodeWithSelector(MezoutAgentWallet.MerchantNotAllowed.selector)
        );
    }

    function test_attack_invoicePayingTheWalletItself() public {
        _expectRelayRevert(
            _invoice(address(wallet), 1e18, 0), abi.encodeWithSelector(MezoutAgentWallet.MerchantNotAllowed.selector)
        );
    }

    /// The agent forges its own invoice to an address it controls; only Mezout's invoice signer can sign one.
    function test_attack_selfSignedInvoice() public {
        MezoutRouter.Invoice memory inv = _invoice(makeAddr("agentOtherAddress"), 10e18, 0);
        bytes memory forged = _sign(agentPk, router.hashInvoice(inv));
        bytes memory aSig = _agentSig(agentPk, router, inv, address(wallet));
        vm.expectRevert(MezoutRouter.InvalidInvoiceSignature.selector);
        vm.prank(relayer);
        wallet.pay(inv, forged, agent, aSig);
        assertEq(wallet.spentOnDay(agent, _today()), 0);
    }

    // ---------------------------------------------------------------- session keys

    function test_revert_neverApprovedKey() public {
        MezoutRouter.Invoice memory inv = _invoice(merchant, 1e18, 0);
        bytes memory invSig = _invSig(router, inv);
        vm.expectRevert(MezoutAgentWallet.AgentNotApproved.selector);
        vm.prank(stranger);
        wallet.pay(inv, invSig, stranger, "");
    }

    function test_revert_strangerSignsForApprovedAgent() public {
        MezoutRouter.Invoice memory inv = _invoice(merchant, 1e18, 0);
        bytes memory invSig = _invSig(router, inv);
        bytes memory forged = _agentSig(strangerPk, router, inv, address(wallet));
        vm.expectRevert(MezoutAgentWallet.InvalidAgentSignature.selector);
        vm.prank(relayer);
        wallet.pay(inv, invSig, agent, forged);
    }

    function test_revert_expiredKey() public {
        _approve(agent, 10e18, 25e18, uint64(block.timestamp + 1 hours), new address[](0));
        vm.warp(block.timestamp + 1 hours);
        _relay(_invoice(merchant, 1e18, 0)); // the last second still counts
        vm.warp(block.timestamp + 1);
        _expectRelayRevert(
            _invoice(merchant, 1e18, 0), abi.encodeWithSelector(MezoutAgentWallet.SessionExpired.selector)
        );
        assertEq(wallet.remainingToday(agent), 0);
    }

    /// The relayer already holds a signed payment when the owner revokes; it must not go through.
    function test_revert_revokedKeyWithSignatureInFlight() public {
        MezoutRouter.Invoice memory inv = _invoice(merchant, 1e18, 0);
        bytes memory invSig = _invSig(router, inv);
        bytes memory aSig = _agentSig(agentPk, router, inv, address(wallet));
        vm.prank(owner);
        wallet.revokeAgent(agent);
        vm.expectRevert(MezoutAgentWallet.AgentNotApproved.selector);
        vm.prank(relayer);
        wallet.pay(inv, invSig, agent, aSig);
        vm.expectRevert(MezoutAgentWallet.AgentNotApproved.selector);
        vm.prank(agent);
        wallet.pay(inv, invSig, agent, "");
    }

    function test_revert_invalidApprovals() public {
        vm.startPrank(owner);
        vm.expectRevert(MezoutAgentWallet.InvalidAgent.selector);
        wallet.approveAgent(address(0), 1, 1, uint64(block.timestamp + 1), new address[](0));
        vm.expectRevert(MezoutAgentWallet.InvalidAgent.selector);
        wallet.approveAgent(owner, 1, 1, uint64(block.timestamp + 1), new address[](0));
        vm.expectRevert(MezoutAgentWallet.InvalidAgent.selector);
        wallet.approveAgent(address(wallet), 1, 1, uint64(block.timestamp + 1), new address[](0));
        vm.expectRevert(MezoutAgentWallet.InvalidLimits.selector);
        wallet.approveAgent(agent, 0, 1, uint64(block.timestamp + 1), new address[](0));
        vm.expectRevert(MezoutAgentWallet.InvalidLimits.selector);
        wallet.approveAgent(agent, 2, 1, uint64(block.timestamp + 1), new address[](0));
        vm.expectRevert(MezoutAgentWallet.InvalidLimits.selector);
        wallet.approveAgent(agent, 1, 1, uint64(block.timestamp), new address[](0));
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- replay

    function test_replay_sameInvoiceTwice() public {
        MezoutRouter.Invoice memory inv = _invoice(merchant, 5e18, 0);
        _relay(inv);
        _expectRelayRevert(inv, abi.encodeWithSelector(MezoutRouter.InvoiceAlreadyPaid.selector));
        assertEq(wallet.spentOnDay(agent, _today()), 5e18);
        assertEq(musd.balanceOf(merchant), 5e18);
    }

    /// One session key approved on two wallets: a signature for wallet A does not pay from wallet B.
    function test_replay_signatureForAnotherWallet() public {
        MezoutAgentWallet other = MezoutAgentWallet(factory.createWallet(owner, bytes32(uint256(1))));
        musd.mint(address(other), 100e18);
        vm.prank(owner);
        other.approveAgent(agent, 10e18, 25e18, uint64(block.timestamp + 1 days), new address[](0));

        MezoutRouter.Invoice memory inv = _invoice(merchant, 5e18, 0);
        bytes memory invSig = _invSig(router, inv);
        bytes memory sigForWallet = _agentSig(agentPk, router, inv, address(wallet));
        vm.expectRevert(MezoutAgentWallet.InvalidAgentSignature.selector);
        vm.prank(relayer);
        other.pay(inv, invSig, agent, sigForWallet);
    }

    /// The agent's checkout signature for paying from its own EOA does not pay from the wallet.
    function test_replay_eoaPaymentSignature() public {
        MezoutRouter.Invoice memory inv = _invoice(merchant, 5e18, 0);
        bytes memory invSig = _invSig(router, inv);
        bytes memory eoaSig = _agentSig(agentPk, router, inv, agent);
        vm.expectRevert(MezoutAgentWallet.InvalidAgentSignature.selector);
        vm.prank(relayer);
        wallet.pay(inv, invSig, agent, eoaSig);
    }

    /// A relayer cannot swap in a bigger invoice or another merchant under the agent's signature.
    function test_replay_tamperedInvoice() public {
        MezoutRouter.Invoice memory inv = _invoice(merchant, 5e18, 0);
        bytes memory aSig = _agentSig(agentPk, router, inv, address(wallet));
        inv.amount = 10e18;
        bytes memory invSig = _invSig(router, inv);
        vm.expectRevert(MezoutAgentWallet.InvalidAgentSignature.selector);
        vm.prank(relayer);
        wallet.pay(inv, invSig, agent, aSig);
    }

    function test_replay_signatureForOldRouterAfterRouterChange() public {
        MezoutRouter.Invoice memory inv = _invoice(merchant, 5e18, 0);
        bytes memory oldSig = _agentSig(agentPk, router, inv, address(wallet));
        MezoutRouter next = _router(address(musd));
        vm.prank(owner);
        wallet.setRouter(address(next));

        bytes memory invSig = _invSig(next, inv);
        vm.expectRevert(MezoutAgentWallet.InvalidAgentSignature.selector);
        vm.prank(relayer);
        wallet.pay(inv, invSig, agent, oldSig);

        vm.prank(relayer);
        wallet.pay(inv, invSig, agent, _agentSig(agentPk, next, inv, address(wallet)));
        assertTrue(next.paid(inv.orderId));
    }

    // ---------------------------------------------------------------- escapes

    function test_escape_agentCannotCallOwnerFunctions() public {
        bytes memory notOwner = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, agent);
        address fake = address(new FakeRouter(musd));
        vm.startPrank(agent);
        vm.expectRevert(notOwner);
        wallet.withdraw(musd, agent, 1);
        vm.expectRevert(notOwner);
        wallet.approveAgent(agent, type(uint128).max, type(uint128).max, type(uint64).max, new address[](0));
        vm.expectRevert(notOwner);
        wallet.revokeAgent(agent);
        vm.expectRevert(notOwner);
        wallet.setRouter(fake);
        vm.expectRevert(notOwner);
        wallet.transferOwnership(agent);
        vm.expectRevert(notOwner);
        wallet.renounceOwnership();
        vm.stopPrank();
        assertEq(wallet.owner(), owner);
    }

    /// The wallet has no fallback, so ERC-20 or account-style calls aimed at it do nothing but revert.
    function test_escape_noGenericCallSurface() public {
        bytes[] memory calls = new bytes[](4);
        calls[0] = abi.encodeCall(IERC20.transfer, (agent, 1e18));
        calls[1] = abi.encodeCall(IERC20.approve, (agent, type(uint256).max));
        calls[2] = abi.encodeWithSignature(
            "execute(address,uint256,bytes)", address(musd), 0, abi.encodeCall(IERC20.transfer, (agent, 1e18))
        );
        calls[3] = abi.encodeWithSignature("execute(bytes32,bytes)", bytes32(uint256(1) << 248), "");
        for (uint256 i; i < calls.length; ++i) {
            vm.prank(agent);
            (bool ok,) = address(wallet).call(calls[i]);
            assertFalse(ok);
        }
        vm.prank(agent);
        (bool sent,) = address(wallet).call{value: 0}("");
        assertFalse(sent);
        assertEq(musd.balanceOf(address(wallet)), 1_000e18);
        assertEq(musd.allowance(address(wallet), agent), 0);
    }

    /// Calling the router directly with the wallet as payer: the wallet signs nothing (no ERC-1271) and leaves no
    /// allowance, so the agent's Payment signature alone is useless there.
    function test_escape_directRouterCallWithWalletAsPayer() public {
        MezoutRouter.Invoice memory inv = _invoice(merchant, 5e18, 0);
        bytes memory invSig = _invSig(router, inv);
        bytes memory aSig = _agentSig(agentPk, router, inv, address(wallet));
        vm.expectRevert(MezoutRouter.InvalidPayerSignature.selector);
        vm.prank(agent);
        router.payWithMUSD(inv, invSig, address(wallet), aSig, MezoutRouter.PermitSig(0, 0, 0, 0));

        // Even after a legitimate payment, nothing is left approved to drain.
        _relay(_invoice(merchant, 5e18, 0));
        assertEq(musd.allowance(address(wallet), address(router)), 0);
        vm.expectRevert(MezoutRouter.InvalidPayerSignature.selector);
        vm.prank(agent);
        router.payWithMUSD(inv, invSig, address(wallet), aSig, MezoutRouter.PermitSig(0, 0, 0, 0));
    }

    function test_escape_routerCannotBeSwappedForANonRouter() public {
        // A contract with a different MUSD is refused outright.
        address otherRouter = address(_router(address(new MockMUSD())));
        vm.expectRevert(MezoutAgentWallet.RouterMismatch.selector);
        vm.prank(owner);
        wallet.setRouter(otherRouter);
        // An EOA or a contract without musd() reverts.
        vm.expectRevert();
        vm.prank(owner);
        wallet.setRouter(stranger);
        assertEq(address(wallet.router()), address(router));
    }

    function test_renounceOwnership_disabled() public {
        vm.expectRevert(MezoutAgentWallet.OwnerRequired.selector);
        vm.prank(owner);
        wallet.renounceOwnership();
    }

    // ---------------------------------------------------------------- reentrancy and malicious merchants

    /// With a token that hands the merchant control mid-payment, the merchant tries to reenter `pay` (a second invoice
    /// and the same one), withdraw, and raise the agent's limits. Every attempt fails; one payment settles.
    function test_attack_reentrantMaliciousMerchant() public {
        HookedMUSD hooked = new HookedMUSD();
        MezoutRouter r = _router(address(hooked));
        MezoutAgentWallet w = new MezoutAgentWallet(owner, address(r));
        hooked.mint(address(w), 100e18);
        vm.prank(owner);
        w.approveAgent(agent, 10e18, 100e18, uint64(block.timestamp + 1 days), new address[](0));

        MaliciousMerchant evil = new MaliciousMerchant();
        MezoutRouter.Invoice memory first = _invoice(address(evil), 10e18, 0);
        MezoutRouter.Invoice memory second = _invoice(address(evil), 10e18, 0);
        evil.armNext(w, agent, second, _invSig(r, second), _agentSig(agentPk, r, second, address(w)));
        bytes memory invSig = _invSig(r, first);
        bytes memory aSig = _agentSig(agentPk, r, first, address(w));
        evil.armSame(first, invSig, aSig);
        vm.prank(relayer);
        w.pay(first, invSig, agent, aSig);

        assertEq(evil.calls(), 1, "hook ran");
        assertFalse(evil.reentered(), "reentered pay");
        assertFalse(evil.repaid(), "paid twice");
        assertFalse(evil.withdrew(), "withdrew");
        assertFalse(evil.raisedLimits(), "raised limits");
        assertEq(hooked.balanceOf(address(evil)), 10e18);
        assertEq(hooked.balanceOf(address(w)), 90e18);
        assertEq(w.spentOnDay(agent, _today()), 10e18);
        assertFalse(r.paid(second.orderId));
    }

    // ---------------------------------------------------------------- owner

    function test_owner_withdraws() public {
        vm.prank(owner);
        wallet.withdraw(musd, owner, 400e18);
        assertEq(musd.balanceOf(owner), 400e18);
        assertEq(musd.balanceOf(address(wallet)), 600e18);
    }

    function test_owner_twoStepTransferKeepsControl() public {
        address next = makeAddr("nextOwner");
        vm.prank(owner);
        wallet.transferOwnership(next);
        assertEq(wallet.owner(), owner);
        vm.prank(next);
        wallet.acceptOwnership();
        assertEq(wallet.owner(), next);
    }

    /// The owner is a passkey account: it approves and revokes through its ERC-7821 batch, as a user operation would.
    function test_owner_passkeyAccount() public {
        (bytes32 qx, bytes32 qy) = Passkey.publicKey(0xC0FFEE);
        MezoutAccount account = MezoutAccount(payable(new MezoutAccountFactory().createAccount(qx, qy)));
        MezoutAgentWallet w = MezoutAgentWallet(factory.createWallet(address(account), bytes32(0)));
        musd.mint(address(w), 50e18);

        address[] memory none = new address[](0);
        Execution[] memory calls = new Execution[](1);
        calls[0] = Execution(
            address(w), 0, abi.encodeCall(w.approveAgent, (agent, 5e18, 10e18, uint64(block.timestamp + 1 days), none))
        );
        vm.prank(address(ERC4337Utils.ENTRYPOINT_V07));
        account.execute(bytes32(uint256(0x01) << 248), abi.encode(calls));

        MezoutRouter.Invoice memory inv = _invoice(merchant, 5e18, 0);
        bytes memory invSig = _invSig(router, inv);
        bytes memory aSig = _agentSig(agentPk, router, inv, address(w));
        vm.prank(relayer);
        w.pay(inv, invSig, agent, aSig);
        assertEq(musd.balanceOf(merchant), 5e18);

        calls[0] = Execution(address(w), 0, abi.encodeCall(w.revokeAgent, (agent)));
        vm.prank(address(ERC4337Utils.ENTRYPOINT_V07));
        account.execute(bytes32(uint256(0x01) << 248), abi.encode(calls));
        assertEq(w.remainingToday(agent), 0);
    }

    // ---------------------------------------------------------------- factory

    function test_factory_deterministicAndRecorded() public {
        address predicted = factory.getAddress(stranger, bytes32("x"));
        assertFalse(factory.isWallet(predicted));
        address created = factory.createWallet(stranger, bytes32("x"));
        assertEq(created, predicted);
        assertTrue(factory.isWallet(created));
        assertEq(MezoutAgentWallet(created).owner(), stranger);
        assertEq(address(MezoutAgentWallet(created).router()), address(router));
        assertEq(address(MezoutAgentWallet(created).musd()), address(musd));
        assertEq(factory.createWallet(stranger, bytes32("x")), created, "idempotent");
        assertTrue(factory.getAddress(owner, bytes32("x")) != created, "owner is part of the address");
    }

    function test_factory_walletsDeployedElsewhereAreNotRecorded() public {
        MezoutAgentWallet w = new MezoutAgentWallet(owner, address(router));
        assertFalse(factory.isWallet(address(w)));
    }
}
