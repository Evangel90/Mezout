// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {IBorrowerOperationsSignatures} from "./interfaces/mezo/IBorrowerOperationsSignatures.sol";
import {ITroveManager} from "./interfaces/mezo/ITroveManager.sol";
import {IPriceFeed} from "./interfaces/mezo/IPriceFeed.sol";
import {ITigrisPool} from "./interfaces/tigris/ITigrisPool.sol";
import {ITigrisPoolFactory} from "./interfaces/tigris/ITigrisPoolFactory.sol";

/// @title MezoutRouter
/// @notice Pays a platform-signed invoice in MUSD in one transaction: from the payer's MUSD, by borrowing against
/// their BTC, or by swapping their MEZO or BTC on Tigris. Holds no funds between calls, has no owner and cannot be
/// upgraded.
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

    /// @dev The payer's slippage cap and quote expiry for a swap payment.
    struct SwapLimit {
        uint256 maxAmountIn;
        uint256 deadline;
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

    bytes32 public constant SWAP_PAYMENT_TYPEHASH = keccak256(
        "SwapPayment(Invoice invoice,address payer,address tokenIn,uint256 maxAmountIn,uint256 deadline)Invoice(address merchant,uint256 amount,uint256 fee,bytes32 orderId,uint64 expiry)"
    );

    uint256 public constant MIN_BORROW_ICR = 1.6e18;
    uint256 internal constant FEE_DENOMINATOR = 10_000;

    IERC20 public immutable musd;
    IBorrowerOperationsSignatures public immutable borrowerOperationsSignatures;
    ITroveManager public immutable troveManager;
    IPriceFeed public immutable priceFeed;
    address public immutable invoiceSigner;
    address public immutable feeRecipient;
    ITigrisPoolFactory public immutable tigrisFactory;
    IERC20 public immutable btc;
    IERC20 public immutable mezo;

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
    error QuoteExpired();
    error SlippageExceeded(uint256 amountIn, uint256 maxAmountIn);
    error NoPool();
    error InsufficientLiquidity();
    error SwapMismatch();

    constructor(
        address musd_,
        address borrowerOperationsSignatures_,
        address troveManager_,
        address priceFeed_,
        address invoiceSigner_,
        address feeRecipient_,
        address tigrisFactory_,
        address btc_,
        address mezo_
    ) EIP712("MezoutRouter", "1") {
        if (
            musd_ == address(0) || borrowerOperationsSignatures_ == address(0) || troveManager_ == address(0)
                || priceFeed_ == address(0) || invoiceSigner_ == address(0) || feeRecipient_ == address(0)
                || tigrisFactory_ == address(0) || btc_ == address(0) || mezo_ == address(0)
        ) revert ZeroAddress();
        musd = IERC20(musd_);
        borrowerOperationsSignatures = IBorrowerOperationsSignatures(borrowerOperationsSignatures_);
        troveManager = ITroveManager(troveManager_);
        priceFeed = IPriceFeed(priceFeed_);
        invoiceSigner = invoiceSigner_;
        feeRecipient = feeRecipient_;
        tigrisFactory = ITigrisPoolFactory(tigrisFactory_);
        btc = IERC20(btc_);
        mezo = IERC20(mezo_);
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
        _permit(musd, payer, invoice.amount, invoice.amount, permit);

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
            _permit(musd, payer, fromBalance, fromBalance, permit);
            musd.safeTransferFrom(payer, address(this), fromBalance);
        }

        musd.safeTransfer(invoice.merchant, invoice.amount - invoice.fee);
        if (invoice.fee > 0) musd.safeTransfer(feeRecipient, invoice.fee);

        uint256 icr = troveManager.getCurrentICR(payer, priceFeed.fetchPrice());
        if (icr < MIN_BORROW_ICR) revert TroveBelowSafetyFloor(icr);

        _emitPaid(invoice, payer, Method.BORROW, address(musd), fromBalance, borrowed);
    }

    /// @notice Pays the invoice by swapping the payer's MEZO for exactly `invoice.amount` MUSD on Tigris.
    /// @dev Takes only the MEZO the swap needs, computed from the pool's reserves at execution, so nothing is
    /// left to refund. Reverts if that exceeds `limit.maxAmountIn` or the quote has expired.
    /// @param payerSig Payer's EIP-712 `SwapPayment` signature; ignored when the payer submits the call.
    /// @param permit MEZO permit for `limit.maxAmountIn`; `deadline == 0` uses an existing allowance.
    function payWithMEZO(
        Invoice calldata invoice,
        bytes calldata invoiceSig,
        address payer,
        bytes calldata payerSig,
        SwapLimit calldata limit,
        PermitSig calldata permit
    ) external nonReentrant {
        _checkQuote(limit);
        _useInvoice(invoice, invoiceSig, payer, payerSig, hashSwapPayment(invoice, payer, address(mezo), limit));
        _swapAndPay(invoice, payer, mezo, limit, permit, Method.MEZO);
    }

    /// @notice Pays the invoice by swapping the payer's BTC for exactly `invoice.amount` MUSD on Tigris.
    /// @dev Uses Mezo's BTC ERC-20, which shares its balance with native BTC and supports permit, so a relayer can
    /// submit the payment. Same rules as `payWithMEZO`.
    function payWithBTC(
        Invoice calldata invoice,
        bytes calldata invoiceSig,
        address payer,
        bytes calldata payerSig,
        SwapLimit calldata limit,
        PermitSig calldata permit
    ) external nonReentrant {
        _checkQuote(limit);
        _useInvoice(invoice, invoiceSig, payer, payerSig, hashSwapPayment(invoice, payer, address(btc), limit));
        _swapAndPay(invoice, payer, btc, limit, permit, Method.BTC);
    }

    /// @notice The input a swap payment needs right now: the least `tokenIn` that buys `amountOut` MUSD.
    function quoteSwapIn(address tokenIn, uint256 amountOut) external view returns (uint256 amountIn) {
        (, amountIn,) = _quote(tokenIn, amountOut);
    }

    function hashInvoice(Invoice calldata invoice) public view returns (bytes32) {
        return _hashTypedDataV4(_invoiceStructHash(invoice));
    }

    function hashPayment(Invoice calldata invoice, address payer) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(PAYMENT_TYPEHASH, _invoiceStructHash(invoice), payer)));
    }

    function hashSwapPayment(Invoice calldata invoice, address payer, address tokenIn, SwapLimit calldata limit)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    SWAP_PAYMENT_TYPEHASH,
                    _invoiceStructHash(invoice),
                    payer,
                    tokenIn,
                    limit.maxAmountIn,
                    limit.deadline
                )
            )
        );
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
        _useInvoice(invoice, invoiceSig, payer, payerSig, hashPayment(invoice, payer));
    }

    function _useInvoice(
        Invoice calldata invoice,
        bytes calldata invoiceSig,
        address payer,
        bytes calldata payerSig,
        bytes32 payerDigest
    ) internal {
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
        if (msg.sender != payer && !SignatureChecker.isValidSignatureNow(payer, payerDigest, payerSig)) {
            revert InvalidPayerSignature();
        }
        paid[invoice.orderId] = true;
    }

    function _checkQuote(SwapLimit calldata limit) internal view {
        if (block.timestamp > limit.deadline) revert QuoteExpired();
    }

    /// @dev Pulls only the input the swap needs straight from the payer into the pool, then pays out the MUSD.
    function _swapAndPay(
        Invoice calldata invoice,
        address payer,
        IERC20 tokenIn,
        SwapLimit calldata limit,
        PermitSig calldata permit,
        Method method
    ) internal {
        (ITigrisPool pool, uint256 amountIn, bool musdIsToken0) = _quote(address(tokenIn), invoice.amount);
        if (amountIn > limit.maxAmountIn) revert SlippageExceeded(amountIn, limit.maxAmountIn);

        _permit(tokenIn, payer, limit.maxAmountIn, amountIn, permit);
        tokenIn.safeTransferFrom(payer, address(pool), amountIn);
        uint256 before = musd.balanceOf(address(this));
        pool.swap(musdIsToken0 ? invoice.amount : 0, musdIsToken0 ? 0 : invoice.amount, address(this), "");
        if (musd.balanceOf(address(this)) - before != invoice.amount) revert SwapMismatch();

        musd.safeTransfer(invoice.merchant, invoice.amount - invoice.fee);
        if (invoice.fee > 0) musd.safeTransfer(feeRecipient, invoice.fee);

        _emitPaid(invoice, payer, method, address(tokenIn), amountIn, 0);
    }

    /// @dev Exact output on a volatile (x*y) Tigris pool. The pool takes `fee` basis points of the input, rounded
    /// down, then requires `(rIn + amountIn - fee) * (rOut - amountOut) >= rIn * rOut`. This returns the least input
    /// that passes. Stable pools use a different curve and are not supported.
    function _quote(address tokenIn, uint256 amountOut)
        internal
        view
        returns (ITigrisPool pool, uint256 amountIn, bool musdIsToken0)
    {
        pool = ITigrisPool(tigrisFactory.getPool(tokenIn, address(musd), false));
        if (address(pool) == address(0)) revert NoPool();
        (uint256 reserve0, uint256 reserve1,) = pool.getReserves();
        musdIsToken0 = pool.token0() == address(musd);
        (uint256 reserveIn, uint256 reserveOut) = musdIsToken0 ? (reserve1, reserve0) : (reserve0, reserve1);
        if (amountOut >= reserveOut || reserveIn == 0) revert InsufficientLiquidity();

        uint256 fee = tigrisFactory.getFee(address(pool), false);
        uint256 afterFee = Math.mulDiv(reserveIn, amountOut, reserveOut - amountOut, Math.Rounding.Ceil);
        // The pool keeps amountIn - floor(amountIn * fee / D) = ceil(amountIn * (D - fee) / D), so the least input whose
        // net covers afterFee is floor((afterFee - 1) * D / (D - fee)) + 1.
        amountIn = Math.mulDiv(afterFee - 1, FEE_DENOMINATOR, FEE_DENOMINATOR - fee) + 1;
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
    /// `permitted` is the value the payer signed, which for a swap is the slippage cap rather than the amount used.
    function _permit(IERC20 token, address owner, uint256 permitted, uint256 value, PermitSig calldata permit)
        internal
    {
        if (permit.deadline != 0) {
            try IERC20Permit(address(token))
                .permit(owner, address(this), permitted, permit.deadline, permit.v, permit.r, permit.s) {}
                catch {}
        }
        if (token.allowance(owner, address(this)) < value) revert PermitFailed();
    }
}
