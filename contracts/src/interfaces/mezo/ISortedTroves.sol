// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ISortedTroves {
    function getSize() external view returns (uint256);
    function getFirst() external view returns (address);
    function getLast() external view returns (address);
    function getNext(address id) external view returns (address);
}
