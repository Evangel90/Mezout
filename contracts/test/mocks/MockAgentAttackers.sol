// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MezoutRouter} from "../../src/MezoutRouter.sol";
import {MezoutAgentWallet} from "../../src/agent/MezoutAgentWallet.sol";

interface ITransferHook {
    function onTokenReceived() external;
}

/// MUSD has no transfer hooks; this token calls the recipient on every transfer, so a merchant contract gets control
/// in the middle of `pay` and can try to reenter.
contract HookedMUSD is ERC20 {
    constructor() ERC20("Hooked USD", "hUSD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (from != address(0) && to.code.length > 0) {
            try ITransferHook(to).onTokenReceived() {} catch {}
        }
    }
}

/// A merchant contract that, on receiving payment, tries every way back into the wallet it was paid from.
contract MaliciousMerchant is ITransferHook {
    MezoutAgentWallet public wallet;
    MezoutRouter.Invoice internal nextInvoice;
    bytes internal nextInvoiceSig;
    address internal agent;
    bytes internal nextAgentSig;
    MezoutRouter.Invoice internal sameInvoice;
    bytes internal sameInvoiceSig;
    bytes internal sameAgentSig;

    bool public reentered;
    bool public repaid;
    bool public withdrew;
    bool public raisedLimits;
    uint256 public calls;

    /// A second invoice the agent signed (captured from the relay), to pay during the first.
    function armNext(
        MezoutAgentWallet wallet_,
        address agent_,
        MezoutRouter.Invoice memory next,
        bytes memory nextSig,
        bytes memory nextAgent
    ) external {
        wallet = wallet_;
        agent = agent_;
        nextInvoice = next;
        nextInvoiceSig = nextSig;
        nextAgentSig = nextAgent;
    }

    /// The invoice being paid, to replay while it settles.
    function armSame(MezoutRouter.Invoice memory same, bytes memory sameSig, bytes memory sameAgent) external {
        sameInvoice = same;
        sameInvoiceSig = sameSig;
        sameAgentSig = sameAgent;
    }

    function onTokenReceived() external {
        if (address(wallet) == address(0) || calls > 0) return;
        calls++;
        try wallet.pay(nextInvoice, nextInvoiceSig, agent, nextAgentSig) {
            reentered = true;
        } catch {}
        try wallet.pay(sameInvoice, sameInvoiceSig, agent, sameAgentSig) {
            repaid = true;
        } catch {}
        try wallet.withdraw(IERC20(msg.sender), address(this), 1) {
            withdrew = true;
        } catch {}
        try wallet.approveAgent(agent, type(uint128).max, type(uint128).max, type(uint64).max, new address[](0)) {
            raisedLimits = true;
        } catch {}
    }
}

/// A contract that claims to be a router but is not one.
contract FakeRouter {
    IERC20 public musd;

    constructor(IERC20 musd_) {
        musd = musd_;
    }
}
