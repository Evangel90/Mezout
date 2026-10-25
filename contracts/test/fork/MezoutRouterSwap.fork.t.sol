// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MezoutRouter} from "../../src/MezoutRouter.sol";
import {ITigrisPool} from "../../src/interfaces/tigris/ITigrisPool.sol";
import {MockERC20Permit} from "../mocks/MockERC20Permit.sol";
import {MezoTestnet} from "../utils/MezoTestnet.sol";

interface ITigrisPoolFactoryCreate {
    function createPool(address tokenA, address tokenB, bool stable) external returns (address);
    function getPool(address tokenA, address tokenB, bool stable) external view returns (address);
}

interface ITigrisPoolMint {
    function mint(address to) external returns (uint256);
}

/// Swap payments through the real Tigris factory and pools on a Mezo testnet fork. Foundry cannot run Mezo's BTC and
/// MEZO precompiles, so a permit token is deployed at their addresses and the pool's BTC balance is set to its
/// reserve. On testnet the precompile balance is the pool's real balance.
contract MezoutRouterSwapForkTest is Test {
    bytes32 internal constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    IERC20 internal musd = IERC20(MezoTestnet.MUSD);
    MockERC20Permit internal btc;
    MockERC20Permit internal mezo;
    ITigrisPool internal btcPool = ITigrisPool(MezoTestnet.TIGRIS_MUSD_BTC_POOL);
    MezoutRouter internal router;

    uint256 internal signerPk = 0xA11CE;
    uint256 internal payerPk = 0xB0B;
    address internal payer;
    address internal merchant = makeAddr("merchant");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal relayer = makeAddr("relayer");

    function setUp() public {
        vm.createSelectFork(vm.envOr("MEZO_RPC_URL", string("https://rpc.test.mezo.org")), 16_367_000);
        payer = vm.addr(payerPk);

        deployCodeTo("MockERC20Permit.sol:MockERC20Permit", abi.encode("BTC"), MezoTestnet.BTC_TOKEN);
        deployCodeTo("MockERC20Permit.sol:MockERC20Permit", abi.encode("MEZO"), MezoTestnet.MEZO_TOKEN);
        btc = MockERC20Permit(MezoTestnet.BTC_TOKEN);
        mezo = MockERC20Permit(MezoTestnet.MEZO_TOKEN);
        (, uint256 btcReserve,) = btcPool.getReserves();
        btc.mint(address(btcPool), btcReserve);

        router = new MezoutRouter(
            MezoTestnet.MUSD,
            MezoTestnet.BORROWER_OPERATIONS_SIGNATURES,
            MezoTestnet.TROVE_MANAGER,
            MezoTestnet.PRICE_FEED,
            vm.addr(signerPk),
            feeRecipient,
            MezoTestnet.TIGRIS_POOL_FACTORY,
            MezoTestnet.BTC_TOKEN,
            MezoTestnet.MEZO_TOKEN
        );
        btc.mint(payer, 1e18);
        mezo.mint(payer, 1_000_000e18);
    }

    function _invoice(uint256 amount, bytes32 orderId) internal view returns (MezoutRouter.Invoice memory) {
        return MezoutRouter.Invoice({
            merchant: merchant, amount: amount, fee: 0, orderId: orderId, expiry: uint64(block.timestamp + 1 hours)
        });
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _permit(MockERC20Permit token, uint256 value) internal view returns (MezoutRouter.PermitSig memory p) {
        p.deadline = block.timestamp + 1 hours;
        bytes32 structHash =
            keccak256(abi.encode(PERMIT_TYPEHASH, payer, address(router), value, token.nonces(payer), p.deadline));
        (p.v, p.r, p.s) =
            vm.sign(payerPk, keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash)));
    }

    function _pay(MockERC20Permit token, MezoutRouter.Invoice memory inv, uint256 maxAmountIn) internal {
        MezoutRouter.SwapLimit memory limit =
            MezoutRouter.SwapLimit({maxAmountIn: maxAmountIn, deadline: block.timestamp + 2 minutes});
        bytes memory paySig = _sign(payerPk, router.hashSwapPayment(inv, payer, address(token), limit));
        bytes memory invSig = _sign(signerPk, router.hashInvoice(inv));
        MezoutRouter.PermitSig memory p = _permit(token, maxAmountIn);
        vm.prank(relayer);
        if (address(token) == address(btc)) router.payWithBTC(inv, invSig, payer, paySig, limit, p);
        else router.payWithMEZO(inv, invSig, payer, paySig, limit, p);
    }

    function _assertRouterEmpty() internal view {
        assertEq(musd.balanceOf(address(router)), 0, "router holds MUSD");
        assertEq(btc.balanceOf(address(router)), 0, "router holds BTC");
        assertEq(mezo.balanceOf(address(router)), 0, "router holds MEZO");
    }

    function test_fork_payWithBTC_realPool() public {
        MezoutRouter.Invoice memory inv = _invoice(25e18, "fork-btc");
        uint256 quote = router.quoteSwapIn(address(btc), 25e18);
        (uint256 m0, uint256 b0,) = btcPool.getReserves();
        // The pool prices BTC near the reserve ratio; 25 MUSD needs a little more than 25 / price.
        assertGt(quote, 25e18 * b0 / m0);
        assertLt(quote, 25e18 * b0 / m0 * 1001 / 1000);

        _pay(btc, inv, quote * 101 / 100);

        assertEq(musd.balanceOf(merchant), 25e18);
        assertEq(btc.balanceOf(payer), 1e18 - quote);
        (uint256 m1, uint256 b1,) = btcPool.getReserves();
        assertEq(m1, m0 - 25e18);
        assertGe(m1 * b1, m0 * b0, "pool invariant fell");
        _assertRouterEmpty();
    }

    function test_fork_quoteMinusOneFailsTheRealPool() public {
        uint256 quote = router.quoteSwapIn(address(btc), 25e18);
        bool musdIs0 = btcPool.token0() == address(musd);
        assertTrue(musdIs0);

        uint256 snap = vm.snapshotState();
        btc.mint(address(btcPool), quote - 1);
        vm.expectRevert(bytes4(keccak256("K()")));
        btcPool.swap(25e18, 0, address(this), "");

        vm.revertToState(snap);
        btc.mint(address(btcPool), quote);
        btcPool.swap(25e18, 0, address(this), "");
        assertEq(musd.balanceOf(address(this)), 25e18);
    }

    function test_fork_revert_btcSlippage() public {
        MezoutRouter.Invoice memory inv = _invoice(25e18, "fork-btc-slip");
        uint256 quote = router.quoteSwapIn(address(btc), 25e18);
        vm.expectRevert(abi.encodeWithSelector(MezoutRouter.SlippageExceeded.selector, quote, quote - 1));
        this.payExternal(btc, inv, quote - 1);
    }

    function test_fork_payWithMEZO_newPool() public {
        ITigrisPoolFactoryCreate factory = ITigrisPoolFactoryCreate(MezoTestnet.TIGRIS_POOL_FACTORY);
        assertEq(factory.getPool(address(musd), address(mezo), false), address(0), "MUSD/MEZO pool already exists");

        // The M2 test pool: 1 MEZO = 0.25 MUSD.
        address pool = factory.createPool(address(musd), address(mezo), false);
        deal(address(musd), address(this), 1_000e18);
        musd.transfer(pool, 1_000e18);
        mezo.mint(pool, 4_000e18);
        ITigrisPoolMint(pool).mint(address(this));

        MezoutRouter.Invoice memory inv = _invoice(10e18, "fork-mezo");
        uint256 quote = router.quoteSwapIn(address(mezo), 10e18);
        // 10 MUSD at 0.25 is 40 MEZO; 1% price impact and the 0.04% fee make it about 40.42.
        assertApproxEqRel(quote, 40.42e18, 0.001e18);
        _pay(mezo, inv, quote * 101 / 100);

        assertEq(musd.balanceOf(merchant), 10e18);
        assertEq(mezo.balanceOf(payer), 1_000_000e18 - quote);
        _assertRouterEmpty();
    }

    function payExternal(MockERC20Permit token, MezoutRouter.Invoice memory inv, uint256 maxAmountIn) external {
        _pay(token, inv, maxAmountIn);
    }
}
