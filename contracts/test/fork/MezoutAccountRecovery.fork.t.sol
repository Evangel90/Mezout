// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Execution} from "@openzeppelin/contracts/account/utils/draft-ERC7579Utils.sol";
import {PackedUserOperation} from "@openzeppelin/contracts/interfaces/draft-IERC4337.sol";
import {MezoutAccountFactoryV2} from "../../src/account/MezoutAccountFactoryV2.sol";
import {MezoutAccountV2} from "../../src/account/MezoutAccountV2.sol";
import {MezoTestnet} from "../utils/MezoTestnet.sol";
import {Passkey} from "../utils/Passkey.sol";
import {IEntryPointV07} from "./MezoutAccount.fork.t.sol";

/// Passkey recovery on a Mezo testnet fork, through the real EntryPoint v0.7 and P-256 precompile, the way the relayer
/// drives it: the owner sets a backup passkey in a user operation, loses the device, and the backup hands the account to
/// a new passkey after the delay.
contract MezoutAccountRecoveryForkTest is Test {
    bytes32 internal constant BATCH_MODE = bytes32(uint256(0x01) << 248);
    IEntryPointV07 internal constant ENTRY_POINT = IEntryPointV07(0x0000000071727De22E5E9d8BAf0edAc6f37da032);

    IERC20 internal musd = IERC20(MezoTestnet.MUSD);
    MezoutAccountFactoryV2 internal factory;
    uint256 internal ownerPk = 0xA11CE;
    uint256 internal backupPk = 0xBAC;
    uint256 internal newPk = 0x4E3;
    bytes32 internal qx;
    bytes32 internal qy;
    address internal account;
    address payable internal relayer = payable(makeAddr("relayer"));
    address internal payoutBank = makeAddr("payoutBank");

    function setUp() public {
        vm.createSelectFork(vm.envOr("MEZO_RPC_URL", string("https://rpc.test.mezo.org")), 16_339_000);
        factory = new MezoutAccountFactoryV2();
        (qx, qy) = Passkey.publicKey(ownerPk);
        account = factory.getAddress(qx, qy);
        deal(address(musd), account, 500e18);
        vm.deal(relayer, 1 ether);
        vm.prank(relayer);
        ENTRY_POINT.depositTo{value: 0.05 ether}(account);
    }

    function _op(bytes memory call, bool deploy) internal view returns (PackedUserOperation memory op) {
        Execution[] memory calls = new Execution[](1);
        calls[0] = Execution(account, 0, call); // a call on the account itself
        op.sender = account;
        op.nonce = ENTRY_POINT.getNonce(account, 0);
        if (deploy) op.initCode = abi.encodePacked(address(factory), abi.encodeCall(factory.createAccount, (qx, qy)));
        op.callData = abi.encodeCall(MezoutAccountV2(payable(account)).execute, (BATCH_MODE, abi.encode(calls)));
        op.accountGasLimits = bytes32(uint256(3_000_000) << 128 | uint256(300_000));
        op.preVerificationGas = 100_000;
        op.gasFees = bytes32(uint256(1 gwei) << 128 | uint256(1 gwei));
    }

    function _withdrawOp(uint256 amount) internal view returns (PackedUserOperation memory op) {
        op = _op("", false);
        Execution[] memory calls = new Execution[](1);
        calls[0] = Execution(address(musd), 0, abi.encodeCall(IERC20.transfer, (payoutBank, amount)));
        op.callData = abi.encodeCall(MezoutAccountV2(payable(account)).execute, (BATCH_MODE, abi.encode(calls)));
    }

    function _handle(PackedUserOperation memory op, uint256 pk) internal {
        op.signature = Passkey.sign(pk, ENTRY_POINT.getUserOpHash(op));
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        vm.prank(relayer, relayer);
        ENTRY_POINT.handleOps(ops, relayer);
    }

    function test_fork_lostPasskeyRecoveredThroughBackup() public {
        // 1. The owner deploys the account and sets a backup passkey in one sponsored user operation.
        (bytes32 bx, bytes32 by) = Passkey.publicKey(backupPk);
        _handle(_op(abi.encodeCall(MezoutAccountV2(payable(account)).setRecoveryPasskey, (bx, by, 2 days)), true), ownerPk);
        MezoutAccountV2 acct = MezoutAccountV2(payable(account));
        assertGt(account.code.length, 0);
        assertEq(acct.recoveryNonce(), 1);

        // 2. The device is lost. On a new device the merchant creates a passkey; the backup signs the request and the
        // relayer submits it.
        (bytes32 nx, bytes32 ny) = Passkey.publicKey(newPk);
        bytes memory request = Passkey.sign(backupPk, acct.recoveryRequestHash(nx, ny));
        vm.prank(relayer);
        acct.startRecovery(nx, ny, request);

        // 3. Too early: nothing changes hands.
        vm.warp(block.timestamp + 2 days - 1);
        vm.expectRevert();
        acct.completeRecovery();

        // 4. After the delay the relayer completes it, and the new passkey withdraws through the EntryPoint.
        vm.warp(block.timestamp + 1);
        vm.prank(relayer);
        acct.completeRecovery();
        _handle(_withdrawOp(500e18), newPk);
        assertEq(musd.balanceOf(payoutBank), 500e18);
    }

    function test_fork_ownerCancels_newPasskeyGetsNothing() public {
        (bytes32 bx, bytes32 by) = Passkey.publicKey(backupPk);
        _handle(_op(abi.encodeCall(MezoutAccountV2(payable(account)).setRecoveryPasskey, (bx, by, 2 days)), true), ownerPk);
        MezoutAccountV2 acct = MezoutAccountV2(payable(account));
        (bytes32 nx, bytes32 ny) = Passkey.publicKey(newPk);
        acct.startRecovery(nx, ny, Passkey.sign(backupPk, acct.recoveryRequestHash(nx, ny)));

        // The owner still has the passkey and cancels through a sponsored user operation.
        _handle(_op(abi.encodeCall(MezoutAccountV2(payable(account)).cancelRecovery, ()), false), ownerPk);
        (,, uint64 readyAt) = acct.pendingRecovery();
        assertEq(readyAt, 0);

        // The would-be new passkey cannot sign user operations.
        PackedUserOperation memory op = _withdrawOp(500e18);
        op.signature = Passkey.sign(newPk, ENTRY_POINT.getUserOpHash(op));
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        vm.prank(relayer, relayer);
        vm.expectRevert(abi.encodeWithSignature("FailedOp(uint256,string)", 0, "AA24 signature error"));
        ENTRY_POINT.handleOps(ops, relayer);
        assertEq(musd.balanceOf(account), 500e18);
    }
}
