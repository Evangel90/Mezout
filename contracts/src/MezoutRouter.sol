// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IBorrowerOperationsSignatures} from "./interfaces/mezo/IBorrowerOperationsSignatures.sol";
import {ITroveManager} from "./interfaces/mezo/ITroveManager.sol";
import {IPriceFeed} from "./interfaces/mezo/IPriceFeed.sol";

/// @title MezoutRouter
/// @notice Pays a platform-signed invoice in MUSD in one transaction. Holds no funds between calls,
/// has no owner and cannot be upgraded.
contract MezoutRouter is EIP712, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    struct Invoice {
        address merchant;
        uint256 amount;
        uint256 fee;
        bytes32 orderId;
        uint64 expiry;
    }

    struct PermitSig {
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct BorrowAuth {
        uint256 deadline;
        address upperHint;
        address lowerHint;
        bytes signature;
    }

    enum Method {
        MUSD,
        BORROW,
        MEZO,
        BTC
    }

    bytes32 public constant INVOICE_TYPEHASH =
        keccak256("Invoice(address merchant,uint256 amount,uint256 fee,bytes32 orderId,uint64 expiry)");
    bytes32 public constant PAYMENT_TYPEHASH = keccak256(
        "Payment(Invoice invoice,address payer)Invoice(address merchant,uint256 amount,uint256 fee,bytes32 orderId,uint64 expiry)"
    );

    uint256 public constant MIN_BORROW_ICR = 1.6e18;

    IERC20 public immutable musd;
    IBorrowerOperationsSignatures public immutable borrowerOperationsSignatures;
    ITroveManager public immutable troveManager;
    IPriceFeed public immutable priceFeed;
    address public immutable invoiceSigner;
    address public immutable feeRecipient;

    mapping(bytes32 orderId => bool) public paid;

    event Paid(
        bytes32 indexed orderId,
        address indexed merchant,
        address indexed payer,
        uint256 amount,
        uint256 fee,
        Method method,
        address assetIn,
        uint256 amountIn,
        uint256 borrowed
    );

    error InvalidInvoice();
    error InvoiceExpired();
    error InvoiceAlreadyPaid();
    error InvalidInvoiceSignature();
    error InvalidPayerSignature();
    error PermitFailed();
    error InvalidBorrowAmount();
    error BorrowMismatch();
    error TroveBelowSafetyFloor(uint256 icr);
    error ZeroAddress();
    error UnexpectedBTC();

    constructor(
        address musd_,
        address borrowerOperationsSignatures_,
        address troveManager_,
        address priceFeed_,
        address invoiceSigner_,
        address feeRecipient_
    ) EIP712("MezoutRouter", "1") {
        if (
            musd_ == address(0) || borrowerOperationsSignatures_ == address(0) || troveManager_ == address(0)
                || priceFeed_ == address(0) || invoiceSigner_ == address(0) || feeRecipient_ == address(0)
        ) revert ZeroAddress();
        musd = IERC20(musd_);
        borrowerOperationsSignatures = IBorrowerOperationsSignatures(borrowerOperationsSignatures_);
        troveManager = ITroveManager(troveManager_);
        priceFeed = IPriceFeed(priceFeed_);
        invoiceSigner = invoiceSigner_;
        feeRecipient = feeRecipient_;
    }

    /// @dev MUSD's ActivePool sends the caller of withdrawMUSDWithSignature a zero-value BTC transfer.
    receive() external payable {
        if (msg.value != 0) revert UnexpectedBTC();
    }

    /// @notice Pays `invoice.amount` from the payer's MUSD balance.
    /// @param payerSig Payer's EIP-712 `Payment` signature; ignored when the payer submits the call.
    /// @param permit MUSD permit for `invoice.amount`; `deadline == 0` uses an existing allowance.
    function payWithMUSD(
        Invoice calldata invoice,
        bytes calldata invoiceSig,
        address payer,
        bytes calldata payerSig,
        PermitSig calldata permit
    ) external nonReentrant {
        _useInvoice(invoice, invoiceSig, payer, payerSig);
        _permit(payer, invoice.amount, permit);

        uint256 net = invoice.amount - invoice.fee;
        musd.safeTransferFrom(payer, invoice.merchant, net);
        if (invoice.fee > 0) musd.safeTransferFrom(payer, feeRecipient, invoice.fee);

        _emitPaid(invoice, payer, Method.MUSD, address(musd), invoice.amount, 0);
    }

    /// @notice Pays `fromBalance` from the payer's MUSD and borrows the rest against the payer's trove.
    /// @dev The borrow signature must name this router as recipient. Reverts if the trove ends below 160%.
    function payWithBorrow(
        Invoice calldata invoice,
        bytes calldata invoiceSig,
        address payer,
        bytes calldata payerSig,
        uint256 fromBalance,
        PermitSig calldata permit,
        BorrowAuth calldata borrow
    ) external nonReentrant {
        if (fromBalance >= invoice.amount) revert InvalidBorrowAmount();
        _useInvoice(invoice, invoiceSig, payer, payerSig);

        uint256 borrowed = invoice.amount - fromBalance;
        _borrowToRouter(payer, borrowed, borrow);

        if (fromBalance > 0) {
            _permit(payer, fromBalance, permit);
            musd.safeTransferFrom(payer, address(this), fromBalance);
        }

        musd.safeTransfer(invoice.merchant, invoice.amount - invoice.fee);
        if (invoice.fee > 0) musd.safeTransfer(feeRecipient, invoice.fee);

        uint256 icr = troveManager.getCurrentICR(payer, priceFeed.fetchPrice());
        if (icr < MIN_BORROW_ICR) revert TroveBelowSafetyFloor(icr);

        _emitPaid(invoice, payer, Method.BORROW, address(musd), fromBalance, borrowed);
    }

    function hashInvoice(Invoice calldata invoice) public view returns (bytes32) {
        return _hashTypedDataV4(_invoiceStructHash(invoice));
    }

    function hashPayment(Invoice calldata invoice, address payer) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(PAYMENT_TYPEHASH, _invoiceStructHash(invoice), payer)));
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function _invoiceStructHash(Invoice calldata invoice) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(INVOICE_TYPEHASH, invoice.merchant, invoice.amount, invoice.fee, invoice.orderId, invoice.expiry)
        );
    }

    function _useInvoice(Invoice calldata invoice, bytes calldata invoiceSig, address payer, bytes calldata payerSig)
        internal
    {
        if (
            invoice.merchant == address(0) || payer == address(0) || invoice.amount == 0 || invoice.fee > invoice.amount
        ) {
            revert InvalidInvoice();
        }
        if (block.timestamp > invoice.expiry) revert InvoiceExpired();
        if (paid[invoice.orderId]) revert InvoiceAlreadyPaid();
        if (!SignatureChecker.isValidSignatureNow(invoiceSigner, hashInvoice(invoice), invoiceSig)) {
            revert InvalidInvoiceSignature();
        }
        // A relayed call must prove the payer chose this invoice; their permit or borrow signature alone does not.
        if (msg.sender != payer && !SignatureChecker.isValidSignatureNow(payer, hashPayment(invoice, payer), payerSig))
        {
            revert InvalidPayerSignature();
        }
        paid[invoice.orderId] = true;
    }

    function _borrowToRouter(address payer, uint256 amount, BorrowAuth calldata borrow) internal {
        uint256 before = musd.balanceOf(address(this));
        borrowerOperationsSignatures.withdrawMUSDWithSignature(
            amount, borrow.upperHint, borrow.lowerHint, payer, address(this), borrow.signature, borrow.deadline
        );
        if (musd.balanceOf(address(this)) - before != amount) revert BorrowMismatch();
    }

    function _emitPaid(
        Invoice calldata invoice,
        address payer,
        Method method,
        address assetIn,
        uint256 amountIn,
        uint256 borrowed
    ) internal {
        emit Paid(
            invoice.orderId, invoice.merchant, payer, invoice.amount, invoice.fee, method, assetIn, amountIn, borrowed
        );
    }

    /// @dev Tolerates a front-run permit: if the permit was already used, the allowance it set still counts.
    function _permit(address owner, uint256 value, PermitSig calldata permit) internal {
        if (permit.deadline != 0) {
            try IERC20Permit(address(musd))
                .permit(owner, address(this), value, permit.deadline, permit.v, permit.r, permit.s) {}
                catch {}
        }
        if (musd.allowance(owner, address(this)) < value) revert PermitFailed();
    }
}
