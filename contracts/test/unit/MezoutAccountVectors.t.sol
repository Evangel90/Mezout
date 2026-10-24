// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC4337Utils} from "@openzeppelin/contracts/account/utils/draft-ERC4337Utils.sol";
import {PackedUserOperation} from "@openzeppelin/contracts/interfaces/draft-IERC4337.sol";
import {MezoutAccount} from "../../src/account/MezoutAccount.sol";
import {MezoutAccountFactory} from "../../src/account/MezoutAccountFactory.sol";
import {Passkey} from "../utils/Passkey.sol";

/// The SDK's encodeWebAuthnSignature output (packages/sdk/src/account.test.ts, PINNED_SIGNATURE) must validate on-chain.
contract MezoutAccountVectorsTest is Test {
    bytes internal constant SDK_SIGNATURE = hex"ea18074511530ed5f6f42845d24ad3f6e0183084e84ec587cff3c99a506b00b50902f2281c8dbcd100667a7220281d55d13e5fa28d646eb61d62837b1c154f390000000000000000000000000000000000000000000000000000000000000017000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000025939566e798b035b91020cb85751e6e94ac9893fb2b92c929877349b3ccc185fa050000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000847b2274797065223a22776562617574686e2e676574222c226368616c6c656e6765223a22736d30705a5442544135674f634a786565567866776d77796a37463267694631564b7932344735506f3145222c226f726967696e223a2268747470733a2f2f6d657a6f75742e74657374222c2263726f73734f726967696e223a66616c73657d00000000000000000000000000000000000000000000000000000000";

    function test_sdkEncodedPasskeySignatureValidates() public {
        (bytes32 qx, bytes32 qy) = Passkey.publicKey(0xA11CE);
        MezoutAccount account = MezoutAccount(payable(new MezoutAccountFactory().createAccount(qx, qy)));
        PackedUserOperation memory op;
        op.sender = address(account);
        op.signature = SDK_SIGNATURE;

        vm.prank(address(ERC4337Utils.ENTRYPOINT_V07));
        uint256 result = account.validateUserOp(op, keccak256("mezout passkey vector"), 0);
        assertEq(result, ERC4337Utils.SIG_VALIDATION_SUCCESS);

        // And the Solidity helper produces the same bytes, so both suites test one format.
        assertEq(Passkey.sign(0xA11CE, keccak256("mezout passkey vector")), SDK_SIGNATURE);
    }
}
