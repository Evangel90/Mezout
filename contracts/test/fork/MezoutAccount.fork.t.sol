// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Execution} from "@openzeppelin/contracts/account/utils/draft-ERC7579Utils.sol";
import {PackedUserOperation} from "@openzeppelin/contracts/interfaces/draft-IERC4337.sol";
import {MezoutAccount} from "../../src/account/MezoutAccount.sol";
import {MezoutAccountFactory} from "../../src/account/MezoutAccountFactory.sol";
import {MezoTestnet} from "../utils/MezoTestnet.sol";
import {Passkey} from "../utils/Passkey.sol";

/// The parts of EntryPoint v0.7 the relayer uses.
interface IEntryPointV07 {
    function handleOps(PackedUserOperation[] calldata ops, address payable beneficiary) external;
    function getUserOpHash(PackedUserOperation calldata userOp) external view returns (bytes32);
    function getNonce(address sender, uint192 key) external view returns (uint256);
    function depositTo(address account) external payable;
    function balanceOf(address account) external view returns (uint256);
}

/// A passkey merchant account on a Mezo testnet fork, driven through the real EntryPoint v0.7 the way the relayer does.
contract MezoutAccountForkTest is Test {
    bytes32 internal constant BATCH_MODE = bytes32(uint256(0x01) << 248);
    IEntryPointV07 internal constant ENTRY_POINT = IEntryPointV07(0x0000000071727De22E5E9d8BAf0edAc6f37da032);

    IERC20 internal musd = IERC20(MezoTestnet.MUSD);
    MezoutAccountFactory internal factory;
    uint256 internal ownerPk = 0xA11CE;
    bytes32 internal qx;
    bytes32 internal qy;
    address internal account;
    address payable internal relayer = payable(makeAddr("relayer"));
    address internal payoutBank = makeAddr("payoutBank");

    function setUp() public {
        vm.createSelectFork(vm.envOr("MEZO_RPC_URL", string("https://rpc.test.mezo.org")), 16_339_000);
        factory = new MezoutAccountFactory();
        (qx, qy) = Passkey.publicKey(ownerPk);
        account = factory.getAddress(qx, qy);
        deal(address(musd), account, 500e18); // as if two customers had paid this merchant
        vm.deal(relayer, 1 ether);
    }

    function _withdrawOp(uint256 amount, bool deploy) internal view returns (PackedUserOperation memory op) {
        Execution[] memory calls = new Execution[](1);
        calls[0] = Execution(address(musd), 0, abi.encodeCall(IERC20.transfer, (payoutBank, amount)));
        op.sender = account;
        op.nonce = ENTRY_POINT.getNonce(account, 0);
        if (deploy) op.initCode = abi.encodePacked(address(factory), abi.encodeCall(factory.createAccount, (qx, qy)));
        op.callData = abi.encodeCall(MezoutAccount(payable(account)).execute, (BATCH_MODE, abi.encode(calls)));
        op.accountGasLimits = bytes32(uint256(3_000_000) << 128 | uint256(200_000));
        op.preVerificationGas = 100_000;
        op.gasFees = bytes32(uint256(1 gwei) << 128 | uint256(1 gwei));
    }

    function _submit(PackedUserOperation memory op) internal {
        op.signature = Passkey.sign(ownerPk, ENTRY_POINT.getUserOpHash(op));
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        vm.prank(relayer, relayer);
        ENTRY_POINT.handleOps(ops, relayer);
    }

    function test_fork_counterfactualAccountReceivesMUSD() public view {
        assertEq(account.code.length, 0);
        assertEq(musd.balanceOf(account), 500e18);
    }

    function test_fork_firstWithdrawalDeploysAccount_relayerSponsorsGas() public {
        vm.prank(relayer);
        ENTRY_POINT.depositTo{value: 0.01 ether}(account);
        uint256 relayerBefore = relayer.balance;

        _submit(_withdrawOp(200e18, true));

        assertGt(account.code.length, 0);
        assertEq(musd.balanceOf(payoutBank), 200e18);
        assertEq(musd.balanceOf(account), 300e18);
        assertEq(account.balance, 0, "account never needed BTC");
        assertGt(relayer.balance, relayerBefore, "beneficiary refunded from the deposit");

        // Second withdrawal: already deployed, next nonce.
        _submit(_withdrawOp(300e18, false));
        assertEq(musd.balanceOf(payoutBank), 500e18);
        assertEq(ENTRY_POINT.getNonce(account, 0), 2);
    }

    function test_fork_revert_wrongPasskey() public {
        vm.prank(relayer);
        ENTRY_POINT.depositTo{value: 0.01 ether}(account);
        PackedUserOperation memory op = _withdrawOp(500e18, true);
        op.signature = Passkey.sign(0xBAD, ENTRY_POINT.getUserOpHash(op));
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        vm.prank(relayer, relayer);
        vm.expectRevert(abi.encodeWithSignature("FailedOp(uint256,string)", 0, "AA24 signature error"));
        ENTRY_POINT.handleOps(ops, relayer);
        assertEq(musd.balanceOf(account), 500e18);
    }

    function test_fork_revert_replayedOp() public {
        vm.prank(relayer);
        ENTRY_POINT.depositTo{value: 0.01 ether}(account);
        PackedUserOperation memory op = _withdrawOp(100e18, true);
        _submit(op);
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op; // same signature, stale nonce
        vm.prank(relayer, relayer);
        vm.expectRevert();
        ENTRY_POINT.handleOps(ops, relayer);
        assertEq(musd.balanceOf(payoutBank), 100e18);
    }
}
