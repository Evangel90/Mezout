// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {MezoutRouter} from "../src/MezoutRouter.sol";
import {IBorrowerOperationsSignatures} from "../src/interfaces/mezo/IBorrowerOperationsSignatures.sol";

/// Builds a signed borrow-to-pay call for the deployed router v2 on Mezo testnet and prints its calldata.
/// It sends nothing: forge's local simulation cannot run Mezo's price precompile, which v2 calls for its ICR check,
/// so the printed calldata is broadcast with `cast send` from the relayer key.
///
/// Env: TEST_PAYER_PRIVATE_KEY, INVOICE_SIGNER_PRIVATE_KEY (must match v2.invoiceSigner()), MERCHANT,
/// ORDER_ID (bytes32), AMOUNT, FEE, FROM_BALANCE (wei), UPPER_HINT, LOWER_HINT. Compute the hints with `cast` the
/// way the SDK's getBorrowHints does (HintHelpers.getApproxHint, then SortedTroves.findInsertPosition): searching
/// inside forge fetches every trove slot over RPC and takes minutes.
contract PayBorrowV2 is Script {
    MezoutRouter internal constant V2 = MezoutRouter(payable(0xe132f9a1c8dbc31015C3Cf4eE8706c9031bFa431));
    address internal constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    IBorrowerOperationsSignatures internal constant BOS =
        IBorrowerOperationsSignatures(0xD757e3646AF370b15f32EB557F0F8380Df7D639e);

    bytes32 internal constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 internal constant WITHDRAW_MUSD_TYPEHASH =
        keccak256("WithdrawMUSD(uint256 amount,address borrower,address recipient,uint256 nonce,uint256 deadline)");
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    function run() external view {
        uint256 payerPk = vm.envUint("TEST_PAYER_PRIVATE_KEY");
        uint256 signerPk = vm.envUint("INVOICE_SIGNER_PRIVATE_KEY");
        address payer = vm.addr(payerPk);
        require(vm.addr(signerPk) == V2.invoiceSigner(), "signer key is not v2's invoiceSigner");

        MezoutRouter.Invoice memory inv = MezoutRouter.Invoice({
            merchant: vm.envAddress("MERCHANT"),
            amount: vm.envUint("AMOUNT"),
            fee: vm.envUint("FEE"),
            orderId: vm.envBytes32("ORDER_ID"),
            expiry: uint64(block.timestamp + 30 minutes)
        });
        uint256 fromBalance = vm.envUint("FROM_BALANCE");
        uint256 borrowed = inv.amount - fromBalance;
        uint256 deadline = block.timestamp + 30 minutes;

        bytes memory invSig = _sign(signerPk, V2.hashInvoice(inv));
        bytes memory paySig = _sign(payerPk, V2.hashPayment(inv, payer));

        MezoutRouter.PermitSig memory p;
        if (fromBalance > 0) {
            p.deadline = deadline;
            bytes32 permitHash = keccak256(
                abi.encode(PERMIT_TYPEHASH, payer, address(V2), fromBalance, IERC20Permit(MUSD).nonces(payer), deadline)
            );
            (p.v, p.r, p.s) = vm.sign(payerPk, _digest(_domain("Mezo USD", MUSD), permitHash));
        }

        MezoutRouter.BorrowAuth memory b;
        b.deadline = deadline;
        b.upperHint = vm.envAddress("UPPER_HINT");
        b.lowerHint = vm.envAddress("LOWER_HINT");
        bytes32 borrowHash =
            keccak256(abi.encode(WITHDRAW_MUSD_TYPEHASH, borrowed, payer, address(V2), BOS.getNonce(payer), deadline));
        b.signature = _sign(payerPk, _digest(_domain("BorrowerOperationsSignatures", address(BOS)), borrowHash));

        console.log("payer", payer);
        console.log("borrow nonce", BOS.getNonce(payer));
        console.log("borrowed (wei)", borrowed);
        console.log("calldata:");
        console.logBytes(abi.encodeCall(MezoutRouter.payWithBorrow, (inv, invSig, payer, paySig, fromBalance, p, b)));
    }

    function _domain(string memory name, address verifying) internal view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(name)), keccak256("1"), block.chainid, verifying));
    }

    function _digest(bytes32 domain, bytes32 structHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }
}
