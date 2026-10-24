// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MockMUSD} from "./MockMUSD.sol";

contract MockPriceFeed {
    uint256 public price = 80_000e18;

    function setPrice(uint256 p) external {
        price = p;
    }

    function fetchPrice() external view returns (uint256) {
        return price;
    }
}

/// Collateral and debt per borrower; ICR = coll * price / debt, as in MUSD.
contract MockTroveManager {
    mapping(address => uint256) public coll;
    mapping(address => uint256) public debt;

    function setTrove(address borrower, uint256 c, uint256 d) external {
        coll[borrower] = c;
        debt[borrower] = d;
    }

    function addDebt(address borrower, uint256 amount) external {
        debt[borrower] += amount;
    }

    function getCurrentICR(address borrower, uint256 price) external view returns (uint256) {
        if (debt[borrower] == 0) return type(uint256).max;
        return coll[borrower] * price / debt[borrower];
    }
}

/// Same digest and nonce rules as BorrowerOperationsSignatures.withdrawMUSDWithSignature.
contract MockBorrowerOperationsSignatures is EIP712 {
    bytes32 public constant WITHDRAW_MUSD_TYPEHASH =
        keccak256("WithdrawMUSD(uint256 amount,address borrower,address recipient,uint256 nonce,uint256 deadline)");

    MockMUSD public immutable musd;
    MockTroveManager public immutable troveManager;
    mapping(address => uint256) public nonces;

    constructor(MockMUSD musd_, MockTroveManager troveManager_) EIP712("BorrowerOperationsSignatures", "1") {
        musd = musd_;
        troveManager = troveManager_;
    }

    function getNonce(address user) external view returns (uint256) {
        return nonces[user];
    }

    function withdrawDigest(uint256 amount, address borrower, address recipient, uint256 deadline)
        external
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(
            keccak256(abi.encode(WITHDRAW_MUSD_TYPEHASH, amount, borrower, recipient, nonces[borrower], deadline))
        );
    }

    function withdrawMUSDWithSignature(
        uint256 amount,
        address,
        address,
        address borrower,
        address recipient,
        bytes calldata signature,
        uint256 deadline
    ) external {
        require(block.timestamp <= deadline, "Signature expired");
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(WITHDRAW_MUSD_TYPEHASH, amount, borrower, recipient, nonces[borrower], deadline))
        );
        require(ECDSA.recover(digest, signature) == borrower, "BorrowerOperationsSignatures: Invalid signature");
        nonces[borrower]++;
        troveManager.addDebt(borrower, amount);
        musd.mint(recipient, amount);
        // Mirrors ActivePool.sendCollateral(caller, 0) inside restrictedAdjustTrove.
        (bool ok,) = msg.sender.call{value: 0}("");
        require(ok, "Sending BTC failed");
    }
}
