// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// A volatile Tigris pool reduced to what MezoutRouter relies on: optimistic output, input fee in basis points moved
/// out of the pool, then `balance0 * balance1 >= reserve0 * reserve1`.
contract MockTigrisPool {
    using SafeERC20 for IERC20;

    address public immutable token0;
    address public immutable token1;
    bool public constant stable = false;
    MockTigrisFactory public immutable factory;
    address public immutable feeSink = address(0xFEE5);
    uint256 public reserve0;
    uint256 public reserve1;

    error K();

    constructor(address tokenA, address tokenB) {
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        factory = MockTigrisFactory(msg.sender);
    }

    function getReserves() external view returns (uint256, uint256, uint256) {
        return (reserve0, reserve1, block.timestamp);
    }

    /// Adopts the current balances as reserves, like Tigris `sync`.
    function sync() public {
        reserve0 = IERC20(token0).balanceOf(address(this));
        reserve1 = IERC20(token1).balanceOf(address(this));
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata) external {
        (uint256 r0, uint256 r1) = (reserve0, reserve1);
        if (amount0Out > 0) IERC20(token0).safeTransfer(to, amount0Out);
        if (amount1Out > 0) IERC20(token1).safeTransfer(to, amount1Out);
        uint256 b0 = IERC20(token0).balanceOf(address(this));
        uint256 b1 = IERC20(token1).balanceOf(address(this));
        uint256 in0 = b0 > r0 - amount0Out ? b0 - (r0 - amount0Out) : 0;
        uint256 in1 = b1 > r1 - amount1Out ? b1 - (r1 - amount1Out) : 0;
        uint256 fee = factory.getFee(address(this), false);
        if (in0 > 0) IERC20(token0).safeTransfer(feeSink, in0 * fee / 10_000);
        if (in1 > 0) IERC20(token1).safeTransfer(feeSink, in1 * fee / 10_000);
        sync();
        if (reserve0 * reserve1 < r0 * r1) revert K();
    }
}

contract MockTigrisFactory {
    mapping(address => mapping(address => address)) internal pools;
    uint256 public fee = 4;

    function createPool(address tokenA, address tokenB) external returns (MockTigrisPool pool) {
        pool = new MockTigrisPool(tokenA, tokenB);
        pools[tokenA][tokenB] = address(pool);
        pools[tokenB][tokenA] = address(pool);
    }

    function getPool(address tokenA, address tokenB, bool stable) external view returns (address) {
        return stable ? address(0) : pools[tokenA][tokenB];
    }

    function getFee(address, bool) external view returns (uint256) {
        return fee;
    }

    function setFee(uint256 fee_) external {
        fee = fee_;
    }
}
