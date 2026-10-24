// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Account as OZAccount} from "@openzeppelin/contracts/account/Account.sol";
import {ERC4337Utils} from "@openzeppelin/contracts/account/utils/draft-ERC4337Utils.sol";
import {Execution} from "@openzeppelin/contracts/account/utils/draft-ERC7579Utils.sol";
import {PackedUserOperation} from "@openzeppelin/contracts/interfaces/draft-IERC4337.sol";
import {SignerP256} from "@openzeppelin/contracts/utils/cryptography/signers/SignerP256.sol";
import {MezoutAccount} from "../../src/account/MezoutAccount.sol";
import {MezoutAccountFactory} from "../../src/account/MezoutAccountFactory.sol";
import {MockMUSD} from "../mocks/MockMUSD.sol";
import {Passkey} from "../utils/Passkey.sol";

contract MezoutAccountTest is Test {
    bytes32 internal constant BATCH_MODE = bytes32(uint256(0x01) << 248);
    address internal constant ENTRY_POINT = address(ERC4337Utils.ENTRYPOINT_V07);

    MezoutAccountFactory internal factory;
    MezoutAccount internal account;
    MockMUSD internal musd;
    uint256 internal ownerPk = 0xA11CE;
    uint256 internal otherPk = 0xB0B;
    address internal merchantBank = makeAddr("merchantBank");

    function setUp() public {
        factory = new MezoutAccountFactory();
        (bytes32 qx, bytes32 qy) = Passkey.publicKey(ownerPk);
        account = MezoutAccount(payable(factory.createAccount(qx, qy)));
        musd = new MockMUSD();
        musd.mint(address(account), 1_000e18);
    }

    function _op(bytes memory signature) internal view returns (PackedUserOperation memory op) {
        op.sender = address(account);
        op.signature = signature;
    }

    function _validate(bytes32 userOpHash, bytes memory signature) internal returns (uint256) {
        vm.prank(ENTRY_POINT);
        return account.validateUserOp(_op(signature), userOpHash, 0);
    }

    function _transferCall(address to, uint256 amount) internal view returns (bytes memory) {
        Execution[] memory calls = new Execution[](1);
        calls[0] = Execution(address(musd), 0, abi.encodeCall(musd.transfer, (to, amount)));
        return abi.encode(calls);
    }

    // Factory

    function test_factory_predictsAddressBeforeDeployment() public {
        (bytes32 qx, bytes32 qy) = Passkey.publicKey(otherPk);
        address predicted = factory.getAddress(qx, qy);
        assertEq(predicted.code.length, 0);
        assertEq(factory.createAccount(qx, qy), predicted);
        assertGt(predicted.code.length, 0);
    }

    function test_factory_createIsIdempotent() public {
        (bytes32 qx, bytes32 qy) = Passkey.publicKey(ownerPk);
        assertEq(factory.createAccount(qx, qy), address(account));
    }

    function test_factory_distinctKeysGetDistinctAccounts() public view {
        (bytes32 qx, bytes32 qy) = Passkey.publicKey(otherPk);
        assertTrue(factory.getAddress(qx, qy) != address(account));
    }

    function test_factory_revert_invalidPublicKey() public {
        vm.expectRevert(abi.encodeWithSelector(SignerP256.SignerP256InvalidPublicKey.selector, bytes32(0), bytes32(0)));
        factory.createAccount(0, 0);
    }

    function test_account_storesSigner() public view {
        (bytes32 qx, bytes32 qy) = Passkey.publicKey(ownerPk);
        (bytes32 sx, bytes32 sy) = account.signer();
        assertEq(sx, qx);
        assertEq(sy, qy);
        assertEq(address(account.entryPoint()), ENTRY_POINT);
    }

    // Signature validation

    function test_validate_acceptsOwnerPasskey() public {
        bytes32 h = keccak256("op");
        assertEq(_validate(h, Passkey.sign(ownerPk, h)), ERC4337Utils.SIG_VALIDATION_SUCCESS);
    }

    function test_validate_rejectsOtherPasskey() public {
        bytes32 h = keccak256("op");
        assertEq(_validate(h, Passkey.sign(otherPk, h)), ERC4337Utils.SIG_VALIDATION_FAILED);
    }

    function test_validate_rejectsSignatureForAnotherOp() public {
        assertEq(
            _validate(keccak256("op"), Passkey.sign(ownerPk, keccak256("other op"))), ERC4337Utils.SIG_VALIDATION_FAILED
        );
    }

    function test_validate_rejectsWithoutUserVerification() public {
        bytes32 h = keccak256("op");
        bytes memory sig = Passkey.sign(ownerPk, h, "webauthn.get", Passkey.FLAG_UP, false);
        assertEq(_validate(h, sig), ERC4337Utils.SIG_VALIDATION_FAILED);
    }

    function test_validate_rejectsRegistrationCeremony() public {
        bytes32 h = keccak256("op");
        bytes memory sig = Passkey.sign(ownerPk, h, "webauthn.create", Passkey.FLAG_UP | Passkey.FLAG_UV, false);
        assertEq(_validate(h, sig), ERC4337Utils.SIG_VALIDATION_FAILED);
    }

    function test_validate_rejectsHighS() public {
        bytes32 h = keccak256("op");
        bytes memory sig = Passkey.sign(ownerPk, h, "webauthn.get", Passkey.FLAG_UP | Passkey.FLAG_UV, true);
        assertEq(_validate(h, sig), ERC4337Utils.SIG_VALIDATION_FAILED);
    }

    function test_validate_rejectsMalformedSignature() public {
        assertEq(_validate(keccak256("op"), hex"1234"), ERC4337Utils.SIG_VALIDATION_FAILED);
    }

    function test_validate_revert_notEntryPoint() public {
        bytes32 h = keccak256("op");
        bytes memory sig = Passkey.sign(ownerPk, h);
        vm.expectRevert(abi.encodeWithSelector(OZAccount.AccountUnauthorized.selector, address(this)));
        account.validateUserOp(_op(sig), h, 0);
    }

    function test_validate_paysPrefundToEntryPoint() public {
        vm.deal(address(account), 1 ether);
        bytes32 h = keccak256("op");
        bytes memory sig = Passkey.sign(ownerPk, h);
        vm.prank(ENTRY_POINT);
        account.validateUserOp(_op(sig), h, 0.1 ether);
        assertEq(ENTRY_POINT.balance, 0.1 ether);
    }

    // Execution

    function test_execute_fromEntryPoint() public {
        vm.prank(ENTRY_POINT);
        account.execute(BATCH_MODE, _transferCall(merchantBank, 250e18));
        assertEq(musd.balanceOf(merchantBank), 250e18);
        assertEq(musd.balanceOf(address(account)), 750e18);
    }

    function test_execute_revert_fromAnyoneElse() public {
        vm.expectRevert(abi.encodeWithSelector(OZAccount.AccountUnauthorized.selector, address(this)));
        account.execute(BATCH_MODE, _transferCall(address(this), 1_000e18));
    }

    function testFuzz_validate_rejectsForeignKeys(uint256 pk) public {
        pk = bound(pk, 1, Passkey.N - 1);
        vm.assume(pk != ownerPk);
        bytes32 h = keccak256("op");
        assertEq(_validate(h, Passkey.sign(pk, h)), ERC4337Utils.SIG_VALIDATION_FAILED);
    }
}
