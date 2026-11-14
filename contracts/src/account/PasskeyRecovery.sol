// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Account} from "@openzeppelin/contracts/account/Account.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {P256} from "@openzeppelin/contracts/utils/cryptography/P256.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";
import {SignerWebAuthn} from "@openzeppelin/contracts/utils/cryptography/signers/SignerWebAuthn.sol";

/// @title PasskeyRecovery
/// @notice Lets a lost owner passkey be replaced by a recovery signer, after a delay the owner can cancel.
/// @dev The recovery signer is either a backup passkey (P-256, WebAuthn) or an address (an EOA, or a contract wallet
/// through ERC-1271). Its only power is `startRecovery`: it signs an EIP-712 request naming the new owner passkey, and
/// the request is bound to this account, this chain and the current `recoveryNonce`. The new passkey takes over only
/// when `completeRecovery` is called after the delay, and until then the owner can cancel. The recovery signer is never
/// checked in `validateUserOp`, so it cannot move funds, and the account has no ERC-1271 `isValidSignature`, so its
/// signature counts for nothing else either.
///
/// The owner manages the recovery signer through calls from the account itself (a user operation the owner passkey
/// signed). Every change of signer, cancel and completion bumps `recoveryNonce`, so a signed request can be used at
/// most once and never after the owner has acted on the account's recovery settings.
///
/// Recovery protects against a lost passkey, not a stolen one: whoever holds the owner passkey can cancel recovery and
/// remove the recovery signer, just as they can move the funds.
abstract contract PasskeyRecovery is Account, SignerWebAuthn, EIP712 {
    enum RecoveryKind {
        None,
        Address,
        Passkey
    }

    /// The shortest delay an owner may choose: long enough to notice an unwanted recovery and cancel it.
    uint64 public constant MIN_RECOVERY_DELAY = 2 days;
    /// The longest delay, so a typo cannot lock recovery away for years.
    uint64 public constant MAX_RECOVERY_DELAY = 30 days;

    bytes32 public constant START_RECOVERY_TYPEHASH = keccak256("StartRecovery(bytes32 qx,bytes32 qy,uint256 nonce)");

    // One slot: kind, recovery address and delay.
    RecoveryKind private _recoveryKind;
    address private _recoveryAddress;
    uint64 private _recoveryDelay;
    bytes32 private _recoveryQx;
    bytes32 private _recoveryQy;

    bytes32 private _pendingQx;
    bytes32 private _pendingQy;
    uint64 private _pendingReadyAt; // 0 when nothing is pending

    /// Bumped by every change of recovery signer, start, cancel and completion.
    uint256 public recoveryNonce;

    event RecoverySignerSet(RecoveryKind kind, address recoveryAddress, bytes32 qx, bytes32 qy, uint64 delay);
    event RecoverySignerRemoved();
    event RecoveryStarted(bytes32 qx, bytes32 qy, uint64 readyAt, uint256 nonce);
    event RecoveryCancelled(bytes32 qx, bytes32 qy);
    event RecoveryCompleted(bytes32 oldQx, bytes32 oldQy, bytes32 newQx, bytes32 newQy);

    error RecoveryInvalidDelay(uint64 delay);
    error RecoveryInvalidSigner();
    error RecoveryNotSet();
    error RecoveryAlreadyPending();
    error RecoveryNotPending();
    error RecoveryNotReady(uint64 readyAt);
    error RecoveryInvalidSignature();

    // Owner actions. Only the account itself (an owner-signed user operation) or the EntryPoint can call them.

    /// @notice Sets an address (an EOA or an ERC-1271 wallet) as the recovery signer. Cancels a pending recovery.
    function setRecoveryAddress(address recoveryAddress, uint64 delay) external onlyEntryPointOrSelf {
        if (recoveryAddress == address(0) || recoveryAddress == address(this)) revert RecoveryInvalidSigner();
        _setRecovery(RecoveryKind.Address, recoveryAddress, 0, 0, delay);
    }

    /// @notice Sets a backup passkey as the recovery signer. Cancels a pending recovery.
    function setRecoveryPasskey(bytes32 qx, bytes32 qy, uint64 delay) external onlyEntryPointOrSelf {
        (bytes32 ox, bytes32 oy) = signer();
        if (!P256.isValidPublicKey(qx, qy) || (qx == ox && qy == oy)) revert RecoveryInvalidSigner();
        _setRecovery(RecoveryKind.Passkey, address(0), qx, qy, delay);
    }

    /// @notice Removes the recovery signer. Cancels a pending recovery.
    function removeRecoverySigner() external onlyEntryPointOrSelf {
        if (_recoveryKind == RecoveryKind.None) revert RecoveryNotSet();
        _cancelPending();
        _clearRecovery();
        ++recoveryNonce;
    }

    /// @notice Cancels a pending recovery. The recovery signer stays; remove it too if it is no longer trusted.
    function cancelRecovery() external onlyEntryPointOrSelf {
        if (_pendingReadyAt == 0) revert RecoveryNotPending();
        _cancelPending();
        ++recoveryNonce;
    }

    // Recovery. Anyone may submit these (Mezout's relayer pays the gas); the signature and the delay are the checks.

    /// @notice Starts replacing the owner passkey with (qx, qy). `signature` is the recovery signer's signature over
    /// `recoveryRequestHash(qx, qy)`: a WebAuthn assertion for a backup passkey, or an ECDSA or ERC-1271 signature for
    /// a recovery address. Only one recovery can be pending, so a new one needs the owner to cancel the old one first.
    function startRecovery(bytes32 qx, bytes32 qy, bytes calldata signature) external {
        RecoveryKind kind = _recoveryKind;
        if (kind == RecoveryKind.None) revert RecoveryNotSet();
        if (_pendingReadyAt != 0) revert RecoveryAlreadyPending();
        if (!P256.isValidPublicKey(qx, qy)) revert SignerP256InvalidPublicKey(qx, qy);

        uint256 nonce = recoveryNonce;
        bytes32 hash = _hashTypedDataV4(keccak256(abi.encode(START_RECOVERY_TYPEHASH, qx, qy, nonce)));
        if (!_isRecoverySignature(kind, hash, signature)) revert RecoveryInvalidSignature();

        recoveryNonce = nonce + 1;
        uint64 readyAt = uint64(block.timestamp) + _recoveryDelay;
        (_pendingQx, _pendingQy, _pendingReadyAt) = (qx, qy, readyAt);
        emit RecoveryStarted(qx, qy, readyAt, nonce);
    }

    /// @notice Makes the pending passkey the owner once the delay has passed. Anyone may call it then.
    function completeRecovery() external {
        uint64 readyAt = _pendingReadyAt;
        if (readyAt == 0) revert RecoveryNotPending();
        if (block.timestamp < readyAt) revert RecoveryNotReady(readyAt);

        (bytes32 oldQx, bytes32 oldQy) = signer();
        (bytes32 qx, bytes32 qy) = (_pendingQx, _pendingQy);
        delete _pendingQx;
        delete _pendingQy;
        delete _pendingReadyAt;
        ++recoveryNonce;
        _setSigner(qx, qy);
        // A backup passkey that became the owner cannot also be its own backup.
        if (_recoveryKind == RecoveryKind.Passkey && _recoveryQx == qx && _recoveryQy == qy) {
            _clearRecovery();
        }
        emit RecoveryCompleted(oldQx, oldQy, qx, qy);
    }

    // Views

    function recoverySigner()
        external
        view
        returns (RecoveryKind kind, address recoveryAddress, bytes32 qx, bytes32 qy, uint64 delay)
    {
        return (_recoveryKind, _recoveryAddress, _recoveryQx, _recoveryQy, _recoveryDelay);
    }

    /// @notice The passkey that will become the owner, and when; readyAt is 0 if nothing is pending.
    function pendingRecovery() external view returns (bytes32 qx, bytes32 qy, uint64 readyAt) {
        return (_pendingQx, _pendingQy, _pendingReadyAt);
    }

    /// @notice The EIP-712 hash the recovery signer signs to start a recovery to (qx, qy) now.
    function recoveryRequestHash(bytes32 qx, bytes32 qy) external view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(START_RECOVERY_TYPEHASH, qx, qy, recoveryNonce)));
    }

    // Internals

    function _setRecovery(RecoveryKind kind, address recoveryAddress, bytes32 qx, bytes32 qy, uint64 delay) private {
        if (delay < MIN_RECOVERY_DELAY || delay > MAX_RECOVERY_DELAY) revert RecoveryInvalidDelay(delay);
        _cancelPending();
        (_recoveryKind, _recoveryAddress, _recoveryDelay) = (kind, recoveryAddress, delay);
        (_recoveryQx, _recoveryQy) = (qx, qy);
        ++recoveryNonce;
        emit RecoverySignerSet(kind, recoveryAddress, qx, qy, delay);
    }

    function _clearRecovery() private {
        delete _recoveryKind;
        delete _recoveryAddress;
        delete _recoveryDelay;
        delete _recoveryQx;
        delete _recoveryQy;
        emit RecoverySignerRemoved();
    }

    function _cancelPending() private {
        if (_pendingReadyAt == 0) return;
        emit RecoveryCancelled(_pendingQx, _pendingQy);
        delete _pendingQx;
        delete _pendingQy;
        delete _pendingReadyAt;
    }

    function _isRecoverySignature(RecoveryKind kind, bytes32 hash, bytes calldata signature)
        private
        view
        returns (bool)
    {
        if (kind == RecoveryKind.Address) {
            return SignatureChecker.isValidSignatureNow(_recoveryAddress, hash, signature);
        }
        (bool decoded, WebAuthn.WebAuthnAuth calldata auth) = WebAuthn.tryDecodeAuth(signature);
        // Same rules as the owner passkey: "webauthn.get", user presence and user verification, low-s.
        return decoded && WebAuthn.verify(abi.encodePacked(hash), auth, _recoveryQx, _recoveryQy, true);
    }
}
