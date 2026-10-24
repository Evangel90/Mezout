// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC5267} from "@openzeppelin/contracts/interfaces/IERC5267.sol";
import {IBorrowerOperationsSignatures} from "../../src/interfaces/mezo/IBorrowerOperationsSignatures.sol";
import {MezoTestnet} from "../utils/MezoTestnet.sol";

contract SignatureDomainsForkTest is Test {
    function setUp() public {
        vm.createSelectFork(vm.envOr("MEZO_RPC_URL", string("https://rpc.test.mezo.org")), 16_339_000);
    }

    function _assertDomain(address target, string memory name, string memory version) internal view {
        (, string memory n, string memory v, uint256 chainId, address verifyingContract,,) =
            IERC5267(target).eip712Domain();
        assertEq(n, name);
        assertEq(v, version);
        assertEq(chainId, MezoTestnet.CHAIN_ID);
        assertEq(verifyingContract, target);
    }

    function test_musdPermitDomain() public view {
        _assertDomain(MezoTestnet.MUSD, "Mezo USD", "1");
    }

    function test_borrowerOperationsSignaturesDomain() public view {
        _assertDomain(MezoTestnet.BORROWER_OPERATIONS_SIGNATURES, "BorrowerOperationsSignatures", "1");
    }

    function test_withdrawNonceIsReadable() public view {
        IBorrowerOperationsSignatures(MezoTestnet.BORROWER_OPERATIONS_SIGNATURES).getNonce(address(this));
    }
}
