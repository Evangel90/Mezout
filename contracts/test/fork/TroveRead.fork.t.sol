// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IPriceFeed} from "../../src/interfaces/mezo/IPriceFeed.sol";
import {IAggregatorV3} from "../../src/interfaces/mezo/IAggregatorV3.sol";
import {ITroveManager} from "../../src/interfaces/mezo/ITroveManager.sol";
import {ISortedTroves} from "../../src/interfaces/mezo/ISortedTroves.sol";
import {MezoTestnet} from "../utils/MezoTestnet.sol";

contract TroveReadForkTest is Test {
    uint256 internal constant FORK_BLOCK = 16_339_000;
    int256 internal constant PINNED_BTC_PRICE = 80_000e18;

    IPriceFeed internal priceFeed = IPriceFeed(MezoTestnet.PRICE_FEED);
    ITroveManager internal troveManager = ITroveManager(MezoTestnet.TROVE_MANAGER);
    ISortedTroves internal sortedTroves = ISortedTroves(MezoTestnet.SORTED_TROVES);

    function setUp() public {
        vm.createSelectFork(vm.envOr("MEZO_RPC_URL", string("https://rpc.test.mezo.org")), FORK_BLOCK);
    }

    function _pinOracle(int256 answer) internal {
        vm.mockCall(MezoTestnet.BTC_ORACLE, abi.encodeCall(IAggregatorV3.decimals, ()), abi.encode(uint8(18)));
        vm.mockCall(
            MezoTestnet.BTC_ORACLE,
            abi.encodeCall(IAggregatorV3.latestRoundData, ()),
            abi.encode(uint80(1), answer, block.timestamp, block.timestamp, uint80(1))
        );
    }

    function test_priceFeedPointsAtPrecompileOracle() public view {
        assertEq(priceFeed.oracle(), MezoTestnet.BTC_ORACLE);
    }

    function test_unpinnedPriceFeedRevertsOnFork() public {
        vm.expectRevert();
        priceFeed.fetchPrice();
    }

    function test_readsRealTroveWithPinnedPrice() public {
        _pinOracle(PINNED_BTC_PRICE);
        uint256 price = priceFeed.fetchPrice();
        assertEq(price, uint256(PINNED_BTC_PRICE));

        assertGt(sortedTroves.getSize(), 0);
        address borrower = sortedTroves.getFirst();
        assertEq(uint8(troveManager.getTroveStatus(borrower)), uint8(ITroveManager.Status.active));

        (uint256 coll, uint256 principal, uint256 interest,,,) = troveManager.getEntireDebtAndColl(borrower);
        assertGt(coll, 0);
        assertGt(principal, 0);

        uint256 icr = troveManager.getCurrentICR(borrower, price);
        uint256 expected = coll * price / (principal + interest);
        assertApproxEqRel(icr, expected, 0.01e18);
        assertGe(icr, MezoTestnet.MCR);
        assertFalse(troveManager.checkRecoveryMode(price));

        emit log_named_address("borrower", borrower);
        emit log_named_decimal_uint("collateral BTC", coll, 18);
        emit log_named_decimal_uint("debt MUSD", principal + interest, 18);
        emit log_named_decimal_uint("ICR %", icr * 100, 18);
    }
}
