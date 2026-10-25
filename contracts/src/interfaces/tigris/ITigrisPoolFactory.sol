// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice The parts of the Tigris PoolFactory that MezoutRouter uses. Source: mezo-org/tigris `PoolFactory.sol` @ 0a3b5e8.
interface ITigrisPoolFactory {
    /// @dev Returns the single pool for a token pair and curve, or zero if none exists.
    function getPool(address tokenA, address tokenB, bool stable) external view returns (address);

    /// @dev Swap fee in basis points of the input amount.
    function getFee(address pool, bool stable) external view returns (uint256);
}
