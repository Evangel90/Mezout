// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MezoutRouter} from "../../src/MezoutRouter.sol";

/// Fixed vectors shared with packages/sdk/src/typedData.test.ts.
contract TypedDataVectorsTest is Test {
    address internal constant ROUTER = 0x000000000000000000000000000000000000bEEF;
    bytes32 internal constant INVOICE_HASH = 0x9c9d8d8d472a8ae2d7d56b0611899aa189f434140d2dab5d42b72511f0f90c61;
    bytes32 internal constant PAYMENT_HASH = 0x49f60c72a2ae11ecacd6ec1e52abe9aa6c9b8092b5f7bf43359550b78025373f;
    bytes32 internal constant SWAP_PAYMENT_HASH = 0xc0411bef459b070a7da8941dca9a7df6e94fed3cb1d27f4694609452db70d8f9;

    function test_vectors() public {
        vm.chainId(31611);
        deployCodeTo(
            "MezoutRouter.sol:MezoutRouter",
            abi.encode(
                address(1), address(2), address(3), address(4), address(5), address(6), address(7), address(8), address(9)
            ),
            ROUTER
        );
        MezoutRouter.Invoice memory inv = MezoutRouter.Invoice({
            merchant: 0x1111111111111111111111111111111111111111,
            amount: 123.45e18,
            fee: 1.2345e18,
            orderId: keccak256("order-vector"),
            expiry: 1_800_000_000
        });
        assertEq(MezoutRouter(payable(ROUTER)).hashInvoice(inv), INVOICE_HASH);
        assertEq(
            MezoutRouter(payable(ROUTER)).hashPayment(inv, 0x2222222222222222222222222222222222222222), PAYMENT_HASH
        );
        MezoutRouter.SwapLimit memory limit = MezoutRouter.SwapLimit({maxAmountIn: 600e18, deadline: 1_800_000_100});
        assertEq(
            MezoutRouter(payable(ROUTER)).hashSwapPayment(
                inv, 0x2222222222222222222222222222222222222222, 0x7B7c000000000000000000000000000000000001, limit
            ),
            SWAP_PAYMENT_HASH
        );
    }
}
