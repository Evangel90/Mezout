// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IBorrowerOperationsSignatures {
    /// Typed data: WithdrawMUSD(uint256 amount,address borrower,address recipient,uint256 nonce,uint256 deadline)
    /// Domain: name "BorrowerOperationsSignatures", version "1". Recovered with plain ECDSA (EOA signers only).
    function withdrawMUSDWithSignature(
        uint256 amount,
        address upperHint,
        address lowerHint,
        address borrower,
        address recipient,
        bytes calldata signature,
        uint256 deadline
    ) external;

    function getNonce(address borrower) external view returns (uint256);
}
