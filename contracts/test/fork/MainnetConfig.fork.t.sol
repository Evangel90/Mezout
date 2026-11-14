// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC5267} from "@openzeppelin/contracts/interfaces/IERC5267.sol";
import {DeployMainnet} from "../../script/DeployMainnet.s.sol";
import {MezoMainnet} from "../../script/config/MezoMainnet.sol";

interface IPermitToken {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

/// Read-only checks of script/config/MezoMainnet.sol against Mezo mainnet. Skipped unless MEZO_MAINNET_RPC_URL is set,
/// so the default `forge test` never depends on mainnet. Part of docs/MAINNET-CHECKLIST.md:
///   MEZO_MAINNET_RPC_URL=https://mezo-mainnet.boar.network forge test --match-contract MainnetConfigForkTest -vv
contract MainnetConfigForkTest is Test {
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    function setUp() public {
        string memory rpc = vm.envOr("MEZO_MAINNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
    }

    function test_deployPreflightPasses() public {
        DeployMainnet script = new DeployMainnet();
        script.preflight(address(0x5161), address(0xFEE5));
    }

    /// The MUSD permit domain the checkout signs against. BTC and MEZO are precompiles that Foundry cannot execute on a
    /// fork; check theirs with cast (docs/MAINNET-CHECKLIST.md) and packages/sdk/src/networks.test.ts.
    function test_musdPermitDomainMatchesTheSdk() public view {
        assertEq(IPermitToken(MezoMainnet.MUSD).DOMAIN_SEPARATOR(), _domain("Mezo USD", MezoMainnet.MUSD));
    }

    function test_borrowerOperationsSignaturesDomain() public view {
        (, string memory name, string memory version, uint256 chainId, address verifyingContract,,) =
            IERC5267(MezoMainnet.BORROWER_OPERATIONS_SIGNATURES).eip712Domain();
        assertEq(name, "BorrowerOperationsSignatures");
        assertEq(version, "1");
        assertEq(chainId, MezoMainnet.CHAIN_ID);
        assertEq(verifyingContract, MezoMainnet.BORROWER_OPERATIONS_SIGNATURES);
    }

    function _domain(string memory name, address token) internal pure returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(name)), keccak256("1"), MezoMainnet.CHAIN_ID, token));
    }
}
