// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ITroveManager {
    enum Status {
        nonExistent,
        active,
        closedByOwner,
        closedByLiquidation,
        closedByRedemption
    }

    function getTroveStatus(address borrower) external view returns (Status);
    function getCurrentICR(address borrower, uint256 price) external view returns (uint256);
    function getTCR(uint256 price) external view returns (uint256);
    function checkRecoveryMode(uint256 price) external view returns (bool);
    function getTroveMaxBorrowingCapacity(address borrower) external view returns (uint256);
    function getEntireDebtAndColl(address borrower)
        external
        view
        returns (
            uint256 coll,
            uint256 principal,
            uint256 interest,
            uint256 pendingCollateral,
            uint256 pendingPrincipal,
            uint256 pendingInterest
        );
}
