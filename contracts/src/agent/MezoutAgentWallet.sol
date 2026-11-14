// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {MezoutRouter} from "../MezoutRouter.sol";

/// @title MezoutAgentWallet
/// @notice Holds an owner's MUSD and lets AI agents, each with its own session key, pay Mezout invoices from it within
/// limits the owner sets: per payment, per UTC day, an optional merchant allow-list, and an expiry. The owner (an EOA,
/// or a `MezoutAccount` passkey account calling through its ERC-7821 `execute`) approves and revokes agents.
/// @dev The agent's only power is `pay`, which pays one platform-signed invoice through `router.payWithMUSD` with this
/// wallet as payer. There is no generic call, approve or transfer an agent can reach. The agent signs the router's own
/// EIP-712 `Payment(invoice, payer = this wallet)`, so a relayer can submit `pay` and pay the gas. The router stays
/// unchanged and is the replay guard: each invoice's `orderId` settles once. This wallet never leaves an allowance on
/// the router between calls and does not implement ERC-1271, so the router can never be called with this wallet as
/// payer except through `pay`.
contract MezoutAgentWallet is Ownable2Step, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    /// @dev One storage slot plus the allow-list id. `maxPerDay` is per calendar day in UTC (`block.timestamp / 1 days`).
    struct Session {
        uint128 maxPerPayment;
        uint128 maxPerDay;
        uint64 validUntil; // 0 means no session (never approved, or revoked)
        uint64 id; // keys the merchant allow-list, so a fresh approval never inherits an old list
        bool merchantAllowlist; // true: only merchants in `merchantAllowed[id]`
    }

    IERC20 public immutable musd;
    MezoutRouter public router;

    mapping(address agent => Session) public sessions;
    mapping(address agent => mapping(uint256 day => uint256)) public spentOnDay;
    mapping(uint64 sessionId => mapping(address merchant => bool)) public merchantAllowed;
    uint64 internal _lastSessionId;

    event AgentApproved(
        address indexed agent,
        uint64 indexed sessionId,
        uint128 maxPerPayment,
        uint128 maxPerDay,
        uint64 validUntil,
        address[] merchants
    );
    event AgentRevoked(address indexed agent);
    event AgentPaid(
        address indexed agent, bytes32 indexed orderId, address indexed merchant, uint256 amount, uint256 spentToday
    );
    event RouterChanged(address indexed router);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    error ZeroAddress();
    error InvalidLimits();
    error InvalidAgent();
    error AgentNotApproved();
    error SessionExpired();
    error InvalidAgentSignature();
    error MerchantNotAllowed();
    error OverPaymentLimit(uint256 amount, uint256 maxPerPayment);
    error OverDailyLimit(uint256 wouldSpend, uint256 maxPerDay);
    error RouterMismatch();
    error PaymentMismatch();
    error OwnerRequired();

    constructor(address owner_, address router_) Ownable(owner_) {
        if (router_ == address(0)) revert ZeroAddress();
        router = MezoutRouter(payable(router_));
        musd = MezoutRouter(payable(router_)).musd();
        emit RouterChanged(router_);
    }

    // ------------------------------------------------------------------ owner

    /// @notice Approves `agent`, or replaces its limits. Spending already recorded today still counts.
    /// @param merchants Allowed merchants; empty means any merchant Mezout signs an invoice for.
    function approveAgent(
        address agent,
        uint128 maxPerPayment,
        uint128 maxPerDay,
        uint64 validUntil,
        address[] calldata merchants
    ) external onlyOwner {
        if (agent == address(0) || agent == address(this) || agent == owner()) revert InvalidAgent();
        if (maxPerPayment == 0 || maxPerPayment > maxPerDay || validUntil <= block.timestamp) revert InvalidLimits();
        uint64 id = ++_lastSessionId;
        for (uint256 i; i < merchants.length; ++i) {
            if (merchants[i] == address(0)) revert ZeroAddress();
            merchantAllowed[id][merchants[i]] = true;
        }
        sessions[agent] = Session({
            maxPerPayment: maxPerPayment,
            maxPerDay: maxPerDay,
            validUntil: validUntil,
            id: id,
            merchantAllowlist: merchants.length > 0
        });
        emit AgentApproved(agent, id, maxPerPayment, maxPerDay, validUntil, merchants);
    }

    /// @notice Revokes `agent` at once: its next `pay`, signed or not, reverts.
    function revokeAgent(address agent) external onlyOwner {
        delete sessions[agent];
        emit AgentRevoked(agent);
    }

    /// @notice Moves to a new Mezout router. Agents' pending signatures are bound to the old router and stop working.
    function setRouter(address router_) external onlyOwner {
        if (router_ == address(0)) revert ZeroAddress();
        if (address(MezoutRouter(payable(router_)).musd()) != address(musd)) revert RouterMismatch();
        router = MezoutRouter(payable(router_));
        emit RouterChanged(router_);
    }

    /// @notice Sends tokens out of the wallet (MUSD, or anything sent here by mistake).
    function withdraw(IERC20 token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        token.safeTransfer(to, amount);
        emit Withdrawn(address(token), to, amount);
    }

    /// @dev Disabled: an ownerless wallet could never revoke its agents or recover its MUSD.
    function renounceOwnership() public view override onlyOwner {
        revert OwnerRequired();
    }

    // ------------------------------------------------------------------ agent

    /// @notice Pays a Mezout invoice from this wallet's MUSD on behalf of `agent`, within its limits.
    /// @dev Anyone may submit (normally Mezout's relayer, which pays the gas). Unless `agent` submits it, `agentSig`
    /// must be the agent's signature of `router.hashPayment(invoice, address(this))`, the same EIP-712 `Payment` a
    /// checkout payer signs, with this wallet as payer.
    function pay(
        MezoutRouter.Invoice calldata invoice,
        bytes calldata invoiceSig,
        address agent,
        bytes calldata agentSig
    ) external nonReentrant {
        Session memory s = sessions[agent];
        if (s.validUntil == 0) revert AgentNotApproved();
        if (block.timestamp > s.validUntil) revert SessionExpired();

        MezoutRouter r = router;
        if (
            msg.sender != agent
                && !SignatureChecker.isValidSignatureNow(agent, r.hashPayment(invoice, address(this)), agentSig)
        ) {
            revert InvalidAgentSignature();
        }

        // An agent must not route the owner's MUSD back to itself or round-trip it through this wallet.
        if (invoice.merchant == agent || invoice.merchant == address(this)) revert MerchantNotAllowed();
        if (s.merchantAllowlist && !merchantAllowed[s.id][invoice.merchant]) revert MerchantNotAllowed();

        if (invoice.amount > s.maxPerPayment) revert OverPaymentLimit(invoice.amount, s.maxPerPayment);
        uint256 day = block.timestamp / 1 days;
        uint256 spent = spentOnDay[agent][day] + invoice.amount;
        if (spent > s.maxPerDay) revert OverDailyLimit(spent, s.maxPerDay);
        spentOnDay[agent][day] = spent;

        // Exact allowance for exactly this call; the router checks the invoice signature, expiry and replay.
        uint256 before = musd.balanceOf(address(this));
        musd.forceApprove(address(r), invoice.amount);
        r.payWithMUSD(invoice, invoiceSig, address(this), "", MezoutRouter.PermitSig(0, 0, 0, 0));
        if (musd.allowance(address(this), address(r)) != 0 || before - musd.balanceOf(address(this)) != invoice.amount)
        {
            revert PaymentMismatch();
        }

        emit AgentPaid(agent, invoice.orderId, invoice.merchant, invoice.amount, spent);
    }

    // ------------------------------------------------------------------ views

    /// @notice What `agent` may still spend today (UTC), ignoring the wallet's balance. Zero when not approved or expired.
    function remainingToday(address agent) external view returns (uint256) {
        Session memory s = sessions[agent];
        if (s.validUntil == 0 || block.timestamp > s.validUntil) return 0;
        uint256 spent = spentOnDay[agent][block.timestamp / 1 days];
        return spent >= s.maxPerDay ? 0 : s.maxPerDay - spent;
    }

    /// @notice Whether `agent` may pay `merchant` under its current session (limits aside).
    function canPayMerchant(address agent, address merchant) external view returns (bool) {
        Session memory s = sessions[agent];
        if (s.validUntil == 0 || block.timestamp > s.validUntil) return false;
        if (merchant == agent || merchant == address(this)) return false;
        return !s.merchantAllowlist || merchantAllowed[s.id][merchant];
    }
}
