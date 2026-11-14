// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Account as OZAccount} from "@openzeppelin/contracts/account/Account.sol";
import {ERC4337Utils} from "@openzeppelin/contracts/account/utils/draft-ERC4337Utils.sol";
import {Execution} from "@openzeppelin/contracts/account/utils/draft-ERC7579Utils.sol";
import {PackedUserOperation} from "@openzeppelin/contracts/interfaces/draft-IERC4337.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignerP256} from "@openzeppelin/contracts/utils/cryptography/signers/SignerP256.sol";
import {MezoutAccountFactory} from "../../src/account/MezoutAccountFactory.sol";
import {MezoutAccountFactoryV2} from "../../src/account/MezoutAccountFactoryV2.sol";
import {MezoutAccountV2} from "../../src/account/MezoutAccountV2.sol";
import {PasskeyRecovery} from "../../src/account/PasskeyRecovery.sol";
import {MockMUSD} from "../mocks/MockMUSD.sol";
import {Passkey} from "../utils/Passkey.sol";

/// A contract wallet (ERC-1271) that accepts signatures from one EOA, standing in for a Safe as recovery address.
contract MockContractWallet is IERC1271 {
    address internal immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        (address signer,,) = ECDSA.tryRecover(hash, signature);
        return signer == owner ? IERC1271.isValidSignature.selector : bytes4(0xffffffff);
    }
}

contract MezoutAccountRecoveryTest is Test {
    bytes32 internal constant BATCH_MODE = bytes32(uint256(0x01) << 248);
    address internal constant ENTRY_POINT = address(ERC4337Utils.ENTRYPOINT_V07);
    uint64 internal constant DELAY = 2 days;

    MezoutAccountFactoryV2 internal factory;
    MezoutAccountV2 internal account;
    MockMUSD internal musd;

    uint256 internal ownerPk = 0xA11CE; // the passkey the merchant signed up with, later lost
    uint256 internal backupPk = 0xBAC; // a backup passkey on another device
    uint256 internal newPk = 0x4E3; // the passkey the merchant creates on their new device
    uint256 internal attackerPk = 0xBAD;
    uint256 internal recoveryEoaPk = 0xE0A;
    address internal recoveryEoa;
    address internal merchantBank = makeAddr("merchantBank");

    bytes32 internal newQx;
    bytes32 internal newQy;

    function setUp() public {
        factory = new MezoutAccountFactoryV2();
        (bytes32 qx, bytes32 qy) = Passkey.publicKey(ownerPk);
        account = MezoutAccountV2(payable(factory.createAccount(qx, qy)));
        musd = new MockMUSD();
        musd.mint(address(account), 1_000e18);
        recoveryEoa = vm.addr(recoveryEoaPk);
        (newQx, newQy) = Passkey.publicKey(newPk);
        vm.warp(1_800_000_000);
    }

    // Helpers

    /// Runs calls from the account the way an owner-signed user operation does: EntryPoint -> execute -> self-call.
    function _asOwner(bytes memory data) internal {
        Execution[] memory calls = new Execution[](1);
        calls[0] = Execution(address(account), 0, data);
        vm.prank(ENTRY_POINT);
        account.execute(BATCH_MODE, abi.encode(calls));
    }

    function _setBackupPasskey(uint256 pk) internal {
        (bytes32 qx, bytes32 qy) = Passkey.publicKey(pk);
        _asOwner(abi.encodeCall(account.setRecoveryPasskey, (qx, qy, DELAY)));
    }

    function _setRecoveryEoa() internal {
        _asOwner(abi.encodeCall(account.setRecoveryAddress, (recoveryEoa, DELAY)));
    }

    /// The EIP-712 hash, built here from first principles rather than with the contract's own helper.
    function _requestHash(address acct, bytes32 qx, bytes32 qy, uint256 nonce) internal view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("MezoutAccount"),
                keccak256("2"),
                block.chainid,
                acct
            )
        );
        bytes32 structHash =
            keccak256(abi.encode(keccak256("StartRecovery(bytes32 qx,bytes32 qy,uint256 nonce)"), qx, qy, nonce));
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    function _passkeyRequest(uint256 signerPk, bytes32 qx, bytes32 qy) internal view returns (bytes memory) {
        return Passkey.sign(signerPk, _requestHash(address(account), qx, qy, account.recoveryNonce()));
    }

    function _eoaSign(uint256 pk, bytes32 hash) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, hash);
        return abi.encodePacked(r, s, v);
    }

    function _eoaRequest(uint256 signerPk, bytes32 qx, bytes32 qy) internal view returns (bytes memory) {
        return _eoaSign(signerPk, _requestHash(address(account), qx, qy, account.recoveryNonce()));
    }

    function _startWithBackup() internal returns (uint64 readyAt) {
        _setBackupPasskey(backupPk);
        account.startRecovery(newQx, newQy, _passkeyRequest(backupPk, newQx, newQy));
        (,, readyAt) = account.pendingRecovery();
    }

    function _validate(uint256 pk) internal returns (uint256) {
        bytes32 h = keccak256("op");
        PackedUserOperation memory op;
        op.sender = address(account);
        op.signature = Passkey.sign(pk, h);
        vm.prank(ENTRY_POINT);
        return account.validateUserOp(op, h, 0);
    }

    function _transfer(address to, uint256 amount) internal view returns (bytes memory) {
        Execution[] memory calls = new Execution[](1);
        calls[0] = Execution(address(musd), 0, abi.encodeCall(musd.transfer, (to, amount)));
        return abi.encode(calls);
    }

    // Factory

    function test_factory_v2AddressDiffersFromV1() public {
        (bytes32 qx, bytes32 qy) = Passkey.publicKey(ownerPk);
        assertEq(factory.getAddress(qx, qy), address(account));
        assertTrue(new MezoutAccountFactory().getAddress(qx, qy) != address(account));
    }

    function test_account_startsWithoutRecovery() public view {
        (PasskeyRecovery.RecoveryKind kind, address a, bytes32 qx, bytes32 qy, uint64 delay) = account.recoverySigner();
        assertEq(uint8(kind), uint8(PasskeyRecovery.RecoveryKind.None));
        assertEq(a, address(0));
        assertEq(qx, bytes32(0));
        assertEq(qy, bytes32(0));
        assertEq(delay, 0);
        (,, uint64 readyAt) = account.pendingRecovery();
        assertEq(readyAt, 0);
        assertEq(account.recoveryNonce(), 0);
    }

    function test_requestHash_matchesEip712() public view {
        assertEq(account.recoveryRequestHash(newQx, newQy), _requestHash(address(account), newQx, newQy, 0));
    }

    /// Same vector as packages/sdk/src/recovery.test.ts (PINNED_HASH): what the dashboard asks a recovery signer to sign.
    function test_requestHash_pinnedVector() public {
        vm.chainId(31611);
        assertEq(
            _requestHash(0x1111111111111111111111111111111111111111, newQx, newQy, 7),
            0x3f09aa37eacfebabfc42f21e71df105157d65f58925a9fcd73dec50c52e2da02
        );
    }

    // Owner sets and removes the recovery signer

    function test_setRecoveryPasskey_storesAndEmits() public {
        (bytes32 qx, bytes32 qy) = Passkey.publicKey(backupPk);
        vm.expectEmit(address(account));
        emit PasskeyRecovery.RecoverySignerSet(PasskeyRecovery.RecoveryKind.Passkey, address(0), qx, qy, DELAY);
        _asOwner(abi.encodeCall(account.setRecoveryPasskey, (qx, qy, DELAY)));
        (PasskeyRecovery.RecoveryKind kind,, bytes32 rx, bytes32 ry, uint64 delay) = account.recoverySigner();
        assertEq(uint8(kind), uint8(PasskeyRecovery.RecoveryKind.Passkey));
        assertEq(rx, qx);
        assertEq(ry, qy);
        assertEq(delay, DELAY);
        assertEq(account.recoveryNonce(), 1);
    }

    function test_setRecoveryAddress_storesAndEmits() public {
        vm.expectEmit(address(account));
        emit PasskeyRecovery.RecoverySignerSet(PasskeyRecovery.RecoveryKind.Address, recoveryEoa, 0, 0, 7 days);
        _asOwner(abi.encodeCall(account.setRecoveryAddress, (recoveryEoa, 7 days)));
        (PasskeyRecovery.RecoveryKind kind, address a,,, uint64 delay) = account.recoverySigner();
        assertEq(uint8(kind), uint8(PasskeyRecovery.RecoveryKind.Address));
        assertEq(a, recoveryEoa);
        assertEq(delay, 7 days);
    }

    function test_setRecovery_directlyFromEntryPoint() public {
        vm.prank(ENTRY_POINT);
        account.setRecoveryAddress(recoveryEoa, DELAY);
        (PasskeyRecovery.RecoveryKind kind,,,,) = account.recoverySigner();
        assertEq(uint8(kind), uint8(PasskeyRecovery.RecoveryKind.Address));
    }

    function test_setRecovery_delayBounds() public {
        _asOwner(abi.encodeCall(account.setRecoveryAddress, (recoveryEoa, 2 days)));
        _asOwner(abi.encodeCall(account.setRecoveryAddress, (recoveryEoa, 30 days)));

        vm.prank(ENTRY_POINT);
        vm.expectRevert(abi.encodeWithSelector(PasskeyRecovery.RecoveryInvalidDelay.selector, uint64(2 days - 1)));
        account.setRecoveryAddress(recoveryEoa, 2 days - 1);

        vm.prank(ENTRY_POINT);
        vm.expectRevert(abi.encodeWithSelector(PasskeyRecovery.RecoveryInvalidDelay.selector, uint64(30 days + 1)));
        account.setRecoveryAddress(recoveryEoa, 30 days + 1);

        vm.prank(ENTRY_POINT);
        vm.expectRevert(abi.encodeWithSelector(PasskeyRecovery.RecoveryInvalidDelay.selector, uint64(0)));
        account.setRecoveryAddress(recoveryEoa, 0);
    }

    function test_setRecovery_rejectsBadSigners() public {
        (bytes32 ox, bytes32 oy) = Passkey.publicKey(ownerPk);
        vm.startPrank(ENTRY_POINT);
        vm.expectRevert(PasskeyRecovery.RecoveryInvalidSigner.selector);
        account.setRecoveryAddress(address(0), DELAY);
        vm.expectRevert(PasskeyRecovery.RecoveryInvalidSigner.selector);
        account.setRecoveryAddress(address(account), DELAY);
        vm.expectRevert(PasskeyRecovery.RecoveryInvalidSigner.selector);
        account.setRecoveryPasskey(0, 0, DELAY);
        vm.expectRevert(PasskeyRecovery.RecoveryInvalidSigner.selector);
        account.setRecoveryPasskey(ox, bytes32(uint256(oy) + 1), DELAY); // not on the curve
        vm.expectRevert(PasskeyRecovery.RecoveryInvalidSigner.selector);
        account.setRecoveryPasskey(ox, oy, DELAY); // the owner passkey cannot be its own backup
        vm.stopPrank();
    }

    function test_removeRecoverySigner() public {
        _setRecoveryEoa();
        vm.expectEmit(address(account));
        emit PasskeyRecovery.RecoverySignerRemoved();
        _asOwner(abi.encodeCall(account.removeRecoverySigner, ()));
        (PasskeyRecovery.RecoveryKind kind, address a,,, uint64 delay) = account.recoverySigner();
        assertEq(uint8(kind), uint8(PasskeyRecovery.RecoveryKind.None));
        assertEq(a, address(0));
        assertEq(delay, 0);
    }

    function test_removeRecoverySigner_revert_notSet() public {
        vm.prank(ENTRY_POINT);
        vm.expectRevert(PasskeyRecovery.RecoveryNotSet.selector);
        account.removeRecoverySigner();
    }

    function test_ownerActions_revert_fromAnyoneElse() public {
        _setRecoveryEoa();
        address[3] memory callers = [address(this), recoveryEoa, makeAddr("relayer")];
        for (uint256 i; i < callers.length; ++i) {
            vm.startPrank(callers[i]);
            vm.expectRevert(abi.encodeWithSelector(OZAccount.AccountUnauthorized.selector, callers[i]));
            account.setRecoveryAddress(callers[i], DELAY);
            vm.expectRevert(abi.encodeWithSelector(OZAccount.AccountUnauthorized.selector, callers[i]));
            account.setRecoveryPasskey(newQx, newQy, DELAY);
            vm.expectRevert(abi.encodeWithSelector(OZAccount.AccountUnauthorized.selector, callers[i]));
            account.removeRecoverySigner();
            vm.expectRevert(abi.encodeWithSelector(OZAccount.AccountUnauthorized.selector, callers[i]));
            account.cancelRecovery();
            vm.stopPrank();
        }
    }

    // Starting a recovery

    function test_start_withBackupPasskey() public {
        _setBackupPasskey(backupPk);
        bytes memory sig = _passkeyRequest(backupPk, newQx, newQy);
        vm.expectEmit(address(account));
        emit PasskeyRecovery.RecoveryStarted(newQx, newQy, uint64(block.timestamp) + DELAY, 1);
        vm.prank(makeAddr("relayer")); // anyone can submit it
        account.startRecovery(newQx, newQy, sig);
        (bytes32 qx, bytes32 qy, uint64 readyAt) = account.pendingRecovery();
        assertEq(qx, newQx);
        assertEq(qy, newQy);
        assertEq(readyAt, block.timestamp + DELAY);
        assertEq(account.recoveryNonce(), 2);
    }

    function test_start_withRecoveryEoa() public {
        _setRecoveryEoa();
        account.startRecovery(newQx, newQy, _eoaRequest(recoveryEoaPk, newQx, newQy));
        (,, uint64 readyAt) = account.pendingRecovery();
        assertEq(readyAt, block.timestamp + DELAY);
    }

    function test_start_withContractWallet() public {
        MockContractWallet wallet = new MockContractWallet(recoveryEoa);
        _asOwner(abi.encodeCall(account.setRecoveryAddress, (address(wallet), DELAY)));
        account.startRecovery(newQx, newQy, _eoaRequest(recoveryEoaPk, newQx, newQy));
        (,, uint64 readyAt) = account.pendingRecovery();
        assertGt(readyAt, 0);
    }

    function test_start_revert_noRecoverySigner() public {
        bytes memory sig = _passkeyRequest(backupPk, newQx, newQy);
        vm.expectRevert(PasskeyRecovery.RecoveryNotSet.selector);
        account.startRecovery(newQx, newQy, sig);
    }

    function test_start_revert_invalidNewPasskey() public {
        _setBackupPasskey(backupPk);
        bytes memory sig = _passkeyRequest(backupPk, newQx, bytes32(0));
        vm.expectRevert(abi.encodeWithSelector(SignerP256.SignerP256InvalidPublicKey.selector, newQx, bytes32(0)));
        account.startRecovery(newQx, bytes32(0), sig);
    }

    // Attacker-first: who can start a recovery, and with which signature

    function test_attack_strangerPasskeyCannotStart() public {
        _setBackupPasskey(backupPk);
        (bytes32 ax, bytes32 ay) = Passkey.publicKey(attackerPk);
        bytes memory sig = _passkeyRequest(attackerPk, ax, ay);
        vm.expectRevert(PasskeyRecovery.RecoveryInvalidSignature.selector);
        account.startRecovery(ax, ay, sig);
    }

    function test_attack_ownerPasskeyIsNotARecoverySigner() public {
        _setBackupPasskey(backupPk);
        bytes memory sig = _passkeyRequest(ownerPk, newQx, newQy);
        vm.expectRevert(PasskeyRecovery.RecoveryInvalidSignature.selector);
        account.startRecovery(newQx, newQy, sig);
    }

    function test_attack_strangerEoaCannotStart() public {
        _setRecoveryEoa();
        bytes memory sig = _eoaRequest(attackerPk, newQx, newQy);
        vm.expectRevert(PasskeyRecovery.RecoveryInvalidSignature.selector);
        account.startRecovery(newQx, newQy, sig);
    }

    function test_attack_cannotSwapTheNewPasskey() public {
        // A relayer or front-runner takes a valid request and substitutes its own key.
        _setBackupPasskey(backupPk);
        bytes memory sig = _passkeyRequest(backupPk, newQx, newQy);
        (bytes32 ax, bytes32 ay) = Passkey.publicKey(attackerPk);
        vm.expectRevert(PasskeyRecovery.RecoveryInvalidSignature.selector);
        account.startRecovery(ax, ay, sig);
    }

    function test_attack_crossAccountReplay() public {
        // The same backup passkey protects two accounts; a request for one is useless on the other.
        (bytes32 qx, bytes32 qy) = Passkey.publicKey(attackerPk);
        MezoutAccountV2 other = MezoutAccountV2(payable(factory.createAccount(qx, qy)));
        (bytes32 bx, bytes32 by) = Passkey.publicKey(backupPk);
        _setBackupPasskey(backupPk);
        vm.prank(ENTRY_POINT);
        other.setRecoveryPasskey(bx, by, DELAY);
        assertEq(other.recoveryNonce(), account.recoveryNonce()); // same nonce, so only the domain separates them

        bytes memory sig = _passkeyRequest(backupPk, newQx, newQy);
        vm.expectRevert(PasskeyRecovery.RecoveryInvalidSignature.selector);
        other.startRecovery(newQx, newQy, sig);
        account.startRecovery(newQx, newQy, sig); // still fine where it belongs
    }

    function test_attack_crossChainReplay() public {
        _setRecoveryEoa();
        bytes memory sig = _eoaRequest(recoveryEoaPk, newQx, newQy);
        vm.chainId(31612);
        vm.expectRevert(PasskeyRecovery.RecoveryInvalidSignature.selector);
        account.startRecovery(newQx, newQy, sig);
    }

    function test_attack_replayAfterCancel() public {
        _setBackupPasskey(backupPk);
        bytes memory sig = _passkeyRequest(backupPk, newQx, newQy);
        account.startRecovery(newQx, newQy, sig);
        _asOwner(abi.encodeCall(account.cancelRecovery, ()));
        vm.expectRevert(PasskeyRecovery.RecoveryInvalidSignature.selector);
        account.startRecovery(newQx, newQy, sig);
    }

    function test_attack_replayAfterCompletion() public {
        _setBackupPasskey(backupPk);
        bytes memory sig = _passkeyRequest(backupPk, newQx, newQy);
        account.startRecovery(newQx, newQy, sig);
        vm.warp(block.timestamp + DELAY);
        account.completeRecovery();
        vm.expectRevert(PasskeyRecovery.RecoveryInvalidSignature.selector);
        account.startRecovery(newQx, newQy, sig);
    }

    function test_attack_oldSignerRequestDiesWithSignerChange() public {
        // A request signed by a recovery address the owner has since replaced is worthless.
        _setRecoveryEoa();
        bytes memory sig = _eoaRequest(recoveryEoaPk, newQx, newQy);
        _setBackupPasskey(backupPk);
        vm.expectRevert(PasskeyRecovery.RecoveryInvalidSignature.selector);
        account.startRecovery(newQx, newQy, sig);
    }

    function test_attack_userOpSignatureIsNotARecoveryRequest() public {
        // The backup passkey also owns another account; its user-op signatures don't start recoveries here.
        _setBackupPasskey(backupPk);
        bytes memory sig = Passkey.sign(backupPk, keccak256("some user operation"));
        vm.expectRevert(PasskeyRecovery.RecoveryInvalidSignature.selector);
        account.startRecovery(newQx, newQy, sig);
    }

    function test_attack_weakWebAuthnAssertionsRejected() public {
        _setBackupPasskey(backupPk);
        bytes32 h = account.recoveryRequestHash(newQx, newQy);
        bytes[4] memory sigs = [
            Passkey.sign(backupPk, h, "webauthn.get", Passkey.FLAG_UP, false), // no user verification
            Passkey.sign(backupPk, h, "webauthn.create", Passkey.FLAG_UP | Passkey.FLAG_UV, false), // registration
            Passkey.sign(backupPk, h, "webauthn.get", Passkey.FLAG_UP | Passkey.FLAG_UV, true), // high-s
            bytes(hex"1234") // malformed
        ];
        for (uint256 i; i < sigs.length; ++i) {
            vm.expectRevert(PasskeyRecovery.RecoveryInvalidSignature.selector);
            account.startRecovery(newQx, newQy, sigs[i]);
        }
    }

    function test_attack_malleableEoaSignatureRejected() public {
        _setRecoveryEoa();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(recoveryEoaPk, account.recoveryRequestHash(newQx, newQy));
        bytes32 highS = bytes32(0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141 - uint256(s));
        bytes memory sig = abi.encodePacked(r, highS, v == 27 ? uint8(28) : uint8(27));
        vm.expectRevert(PasskeyRecovery.RecoveryInvalidSignature.selector);
        account.startRecovery(newQx, newQy, sig);
    }

    // Attacker-first: the delay

    function test_attack_completeBeforeDelay() public {
        uint64 readyAt = _startWithBackup();
        vm.warp(readyAt - 1);
        vm.expectRevert(abi.encodeWithSelector(PasskeyRecovery.RecoveryNotReady.selector, readyAt));
        account.completeRecovery();
        // The old passkey still owns the account.
        assertEq(_validate(ownerPk), ERC4337Utils.SIG_VALIDATION_SUCCESS);
        assertEq(_validate(newPk), ERC4337Utils.SIG_VALIDATION_FAILED);
    }

    function testFuzz_attack_completeBeforeDelay(uint256 elapsed) public {
        uint64 readyAt = _startWithBackup();
        elapsed = bound(elapsed, 0, DELAY - 1);
        vm.warp(block.timestamp + elapsed);
        vm.expectRevert(abi.encodeWithSelector(PasskeyRecovery.RecoveryNotReady.selector, readyAt));
        account.completeRecovery();
    }

    function test_attack_completeWithNothingPending() public {
        _setBackupPasskey(backupPk);
        vm.expectRevert(PasskeyRecovery.RecoveryNotPending.selector);
        account.completeRecovery();
    }

    function test_attack_completeAfterCancel() public {
        uint64 readyAt = _startWithBackup();
        _asOwner(abi.encodeCall(account.cancelRecovery, ()));
        vm.warp(readyAt + 1 days);
        vm.expectRevert(PasskeyRecovery.RecoveryNotPending.selector);
        account.completeRecovery();
        assertEq(_validate(ownerPk), ERC4337Utils.SIG_VALIDATION_SUCCESS);
    }

    function test_attack_secondStartCannotResetTheClock() public {
        uint64 readyAt = _startWithBackup();
        vm.warp(block.timestamp + 1 days);
        bytes memory sig = _passkeyRequest(backupPk, newQx, newQy);
        vm.expectRevert(PasskeyRecovery.RecoveryAlreadyPending.selector);
        account.startRecovery(newQx, newQy, sig);
        (,, uint64 still) = account.pendingRecovery();
        assertEq(still, readyAt);
    }

    // Attacker-first: griefing by a recovery signer that turned hostile

    function test_attack_spammedRequestsEndWhenOwnerRemovesSigner() public {
        _setBackupPasskey(backupPk);
        for (uint256 i; i < 3; ++i) {
            account.startRecovery(newQx, newQy, _passkeyRequest(backupPk, newQx, newQy));
            _asOwner(abi.encodeCall(account.cancelRecovery, ()));
        }
        // One owner operation cancels the pending request and removes the signer.
        account.startRecovery(newQx, newQy, _passkeyRequest(backupPk, newQx, newQy));
        Execution[] memory calls = new Execution[](2);
        calls[0] = Execution(address(account), 0, abi.encodeCall(account.cancelRecovery, ()));
        calls[1] = Execution(address(account), 0, abi.encodeCall(account.removeRecoverySigner, ()));
        vm.prank(ENTRY_POINT);
        account.execute(BATCH_MODE, abi.encode(calls));

        bytes memory fresh = _passkeyRequest(backupPk, newQx, newQy);
        vm.expectRevert(PasskeyRecovery.RecoveryNotSet.selector);
        account.startRecovery(newQx, newQy, fresh);
    }

    function test_attack_strangerSpamCannotBlockRealRecovery() public {
        // Nobody but the recovery signer can occupy the single pending slot.
        _setBackupPasskey(backupPk);
        for (uint256 i = 1; i <= 5; ++i) {
            (bytes32 ax, bytes32 ay) = Passkey.publicKey(attackerPk + i);
            bytes memory junk = _passkeyRequest(attackerPk + i, ax, ay);
            vm.expectRevert(PasskeyRecovery.RecoveryInvalidSignature.selector);
            account.startRecovery(ax, ay, junk);
        }
        account.startRecovery(newQx, newQy, _passkeyRequest(backupPk, newQx, newQy));
    }

    // Attacker-first: the recovery signer cannot move funds

    function test_attack_recoveryPasskeyCannotSignUserOps() public {
        _setBackupPasskey(backupPk);
        assertEq(_validate(backupPk), ERC4337Utils.SIG_VALIDATION_FAILED);
    }

    function test_attack_recoveryEoaCannotExecute() public {
        _setRecoveryEoa();
        vm.prank(recoveryEoa);
        vm.expectRevert(abi.encodeWithSelector(OZAccount.AccountUnauthorized.selector, recoveryEoa));
        account.execute(BATCH_MODE, _transfer(recoveryEoa, 1_000e18));
        assertEq(musd.balanceOf(address(account)), 1_000e18);
    }

    function test_attack_recoverySignerCannotMoveFundsDuringRecovery() public {
        _startWithBackup();
        assertEq(_validate(backupPk), ERC4337Utils.SIG_VALIDATION_FAILED);
        assertEq(_validate(newPk), ERC4337Utils.SIG_VALIDATION_FAILED);
        assertEq(musd.balanceOf(address(account)), 1_000e18);
    }

    // The owner cancels

    function test_cancel_byOwner() public {
        _startWithBackup();
        uint256 nonce = account.recoveryNonce();
        vm.expectEmit(address(account));
        emit PasskeyRecovery.RecoveryCancelled(newQx, newQy);
        _asOwner(abi.encodeCall(account.cancelRecovery, ()));
        (bytes32 qx, bytes32 qy, uint64 readyAt) = account.pendingRecovery();
        assertEq(qx, bytes32(0));
        assertEq(qy, bytes32(0));
        assertEq(readyAt, 0);
        assertEq(account.recoveryNonce(), nonce + 1);
        // The recovery signer stays and can start again with a fresh signature.
        account.startRecovery(newQx, newQy, _passkeyRequest(backupPk, newQx, newQy));
    }

    function test_cancel_revert_nothingPending() public {
        vm.prank(ENTRY_POINT);
        vm.expectRevert(PasskeyRecovery.RecoveryNotPending.selector);
        account.cancelRecovery();
    }

    function test_cancel_byChangingTheSigner() public {
        _startWithBackup();
        vm.expectEmit(address(account));
        emit PasskeyRecovery.RecoveryCancelled(newQx, newQy);
        _setRecoveryEoa();
        (,, uint64 readyAt) = account.pendingRecovery();
        assertEq(readyAt, 0);
    }

    function test_cancel_byRemovingTheSigner() public {
        _startWithBackup();
        _asOwner(abi.encodeCall(account.removeRecoverySigner, ()));
        (,, uint64 readyAt) = account.pendingRecovery();
        assertEq(readyAt, 0);
        vm.warp(block.timestamp + DELAY);
        vm.expectRevert(PasskeyRecovery.RecoveryNotPending.selector);
        account.completeRecovery();
    }

    // Completing

    function test_complete_afterDelay_newPasskeyOwnsTheAccount() public {
        uint64 readyAt = _startWithBackup();
        vm.warp(readyAt);
        (bytes32 ox, bytes32 oy) = Passkey.publicKey(ownerPk);
        vm.expectEmit(address(account));
        emit PasskeyRecovery.RecoveryCompleted(ox, oy, newQx, newQy);
        vm.prank(makeAddr("anyone"));
        account.completeRecovery();

        (bytes32 sx, bytes32 sy) = account.signer();
        assertEq(sx, newQx);
        assertEq(sy, newQy);
        (,, uint64 pending) = account.pendingRecovery();
        assertEq(pending, 0);
        assertEq(_validate(newPk), ERC4337Utils.SIG_VALIDATION_SUCCESS);
        assertEq(_validate(ownerPk), ERC4337Utils.SIG_VALIDATION_FAILED);

        // The backup passkey stays the recovery signer, and the account keeps its address and funds.
        (PasskeyRecovery.RecoveryKind kind,,,,) = account.recoverySigner();
        assertEq(uint8(kind), uint8(PasskeyRecovery.RecoveryKind.Passkey));
        (bytes32 qx, bytes32 qy) = Passkey.publicKey(ownerPk);
        assertEq(factory.getAddress(qx, qy), address(account));
        vm.prank(ENTRY_POINT);
        account.execute(BATCH_MODE, _transfer(merchantBank, 1_000e18));
        assertEq(musd.balanceOf(merchantBank), 1_000e18);
    }

    function test_complete_backupPasskeyBecomesOwner_clearsRecovery() public {
        _setBackupPasskey(backupPk);
        (bytes32 bx, bytes32 by) = Passkey.publicKey(backupPk);
        account.startRecovery(bx, by, _passkeyRequest(backupPk, bx, by));
        vm.warp(block.timestamp + DELAY);
        account.completeRecovery();
        (PasskeyRecovery.RecoveryKind kind,,,,) = account.recoverySigner();
        assertEq(uint8(kind), uint8(PasskeyRecovery.RecoveryKind.None));
        assertEq(_validate(backupPk), ERC4337Utils.SIG_VALIDATION_SUCCESS);
    }

    function test_complete_withRecoveryEoa_longerDelay() public {
        _asOwner(abi.encodeCall(account.setRecoveryAddress, (recoveryEoa, 14 days)));
        account.startRecovery(newQx, newQy, _eoaRequest(recoveryEoaPk, newQx, newQy));
        vm.warp(block.timestamp + 14 days - 1);
        vm.expectRevert();
        account.completeRecovery();
        vm.warp(block.timestamp + 1);
        account.completeRecovery();
        assertEq(_validate(newPk), ERC4337Utils.SIG_VALIDATION_SUCCESS);
    }
}
