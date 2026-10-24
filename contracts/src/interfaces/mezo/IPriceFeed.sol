// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IPriceFeed {
    /// @return price BTC/USD with 18 decimals; reverts if the oracle is older than 60 seconds.
    function fetchPrice() external view returns (uint256 price);
    function oracle() external view returns (address);
}
