// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice The parts of a Tigris (Mezo) pool that MezoutRouter uses. Source: mezo-org/tigris `Pool.sol` @ 0a3b5e8.
interface ITigrisPool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function stable() external view returns (bool);
    function getReserves() external view returns (uint256 reserve0, uint256 reserve1, uint256 blockTimestampLast);

    /// @dev Sends the outputs first, then requires `balance0 * balance1` after the input fee to be at least
    /// `reserve0 * reserve1` (volatile pools). The fee is `amountIn * fee / 10_000`, rounded down.
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
}
