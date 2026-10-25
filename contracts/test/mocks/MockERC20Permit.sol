// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// Stands in for Mezo's BTC and MEZO precompile tokens: 18 decimals with EIP-2612 permit.
contract MockERC20Permit is ERC20, ERC20Permit {
    constructor(string memory name_) ERC20(name_, name_) ERC20Permit(name_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
