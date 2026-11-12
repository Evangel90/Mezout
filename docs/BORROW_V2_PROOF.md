# Router v2 borrow-to-pay proof

Captured 12 November 2026 on Mezo testnet (chain 31611). Router v2 is [`0xe132…a431`](https://explorer.test.mezo.org/address/0xe132f9a1c8dbc31015C3Cf4eE8706c9031bFa431). It still pays older payment links, but the app only offers borrow on the current router v3 [`0x7151…b3E6`](https://explorer.test.mezo.org/address/0x7151473F1300c2529A2eEFaA517684e974A9b3E6). For this proof, v2 was called directly with a forge script and `cast`.

## Live testnet payment through v2

| | |
| --- | --- |
| Transaction | [`0x9fe4…911c`](https://explorer.test.mezo.org/tx/0x9fe4332cb10d2c2d57f49069d20a9032f21a7ea8dd26ffbf72019cbaffbb911c), block 16,733,660, relayed |
| Invoice | 10 MUSD, signed fee 0.1 MUSD (1%), `orderId` = `keccak256("mezout-v2-borrow-proof-2026-11-12")` |
| Payer intent | The payer signed the `Payment` over this invoice, a MUSD permit for exactly 2 MUSD (`fromBalance`), and a `WithdrawMUSD` for exactly 8 MUSD (invoice minus `fromBalance`) with v2 as recipient, at nonce 3 |
| `Paid` event | amount 10, fee 0.1, method `BORROW`, `amountIn` 2, `borrowed` 8 |
| Merchant payout | +9.9 MUSD, exactly the net. The payout wallet is a platform-controlled test wallet that held 0 MUSD before |
| Fee recipient | +0.1 MUSD |
| Payer wallet | −2 MUSD (1,440 → 1,438) |
| Router v2 | 0 MUSD and 0 BTC before and after. The leftover permit allowance is 0 |
| Gas | 532,317 gas used at 146 wei |

The payer's real trove, before and after (block 16,733,659 and block 16,733,660, read with each block's own oracle price):

| | Before | After |
| --- | ---: | ---: |
| Collateral | 0.0494 BTC | 0.0494 BTC |
| Principal | 2,181.980 MUSD | 2,189.988 MUSD (+8 borrowed, +0.008 fee at 0.1%) |
| Accrued interest | 1.1242726 MUSD | 1.1242754 MUSD |
| Total debt | 2,183.104 MUSD | 2,191.112 MUSD |
| BTC price | 72,834.30 | 72,830.25 |
| ICR | 164.81% | 164.20% (≥ 160% floor; v2 checks this on chain) |
| `WithdrawMUSD` nonce | 3 | 4 |

The trove started near the floor, so the live payment was kept small: about 66 MUSD of headroom was left above 160%.

## Fork tests against the deployed v2 bytecode

The tests are in `contracts/test/fork/MezoutRouterV2Borrow.fork.t.sol`, pinned at block 16,733,000. They call the real MUSD protocol and the code deployed at v2's address. Only two things are substituted. First, the BTC price precompile is pinned to 80,000, because Foundry cannot run it. Second, the router's immutable `invoiceSigner` word is replaced with a test key, so the test can sign invoices without the platform key. The test asserts that the replacement left `feeRecipient` unchanged. The deployed v3 is patched the same way for the comparison. Each test opens a new trove: 0.1 BTC of collateral against 2,000 MUSD of net debt, so 2,202 MUSD of total debt and a 363.3% ICR.

| Test | Result |
| --- | --- |
| `test_v2_borrowToPay_endToEnd` | A 1,000 MUSD invoice with a 10 MUSD fee, paid with 200 MUSD from balance and 800 MUSD borrowed. The test asserts the signed borrow equals invoice − `fromBalance`, the recipient is v2, and both signatures recover to the payer and the platform. It also asserts the exact `Paid` event, merchant +990, fee +10, payer wallet −200, and a router left with 0 MUSD, 0 BTC and 0 allowance. Debt rises by exactly 800.8 (2,202 → 3,002.8) with collateral unchanged, and ICR falls from 363.3% to 266.4%, staying ≥ 160% |
| `test_v2_payerIntent_relayerCannotAlterBorrowOrInvoice` | Three relayer tamperings all revert, and nothing is borrowed: borrowing 1,000 against an 800 authorization, redirecting the merchant, and pairing the payer's signatures with a different invoice |
| `test_v2_frontRun_strandsMusdInRouterAndBlocksCheckout` | See below |
| `test_v3_frontRun_completesWithSingleBorrow` | The same attack against deployed v3 |

### The front-running case on v2

`withdrawMUSDWithSignature` can be submitted by anyone. On v2 the payer's borrow authorization names **the router** as the recipient. An attacker who copies it from the relay request or the mempool and submits it first causes the following:

1. 800 MUSD is minted into the v2 router, and the payer's debt rises by 800.8. The attacker gains nothing, because the recipient is signed.
2. The genuine `payWithBorrow` reverts with `BorrowerOperationsSignatures: Invalid signature`, because the authorization's nonce is already spent. The invoice stays unpaid and the merchant receives nothing.
3. The checkout is blocked only until the payer signs a new borrow authorization. With it, the same invoice completes and the merchant gets exactly 990.
4. **The first 800 MUSD is stranded in v2 for good.** v2 has no owner and no sweep, and every path forwards only balance changes, so a later payment through v2 does not release it either. The payer ends up owing both borrows: 2,202 → 3,803.6 MUSD, ICR 210.3%.

So on v2 the attack is griefing, not theft. It costs the payer the borrowed amount plus its fee, and it blocks that checkout until they sign again.

**v3 is different.** The authorization names the payer as the recipient, and the router pulls the full invoice under a permit. A copied borrow submitted first lands in the payer's own wallet. v3 recognizes the spent authorization (`nonce − 1`) and completes checkout from that balance. The test shows merchant +990, router 0 and debt +800.8, so the payer carries one borrow and nothing is stranded.

The front-running case was run only on the fork. Running it live would strand real testnet MUSD in v2 permanently and add debt to a trove that is already close to the floor.

## How to re-run

The fork tests run in your Mac terminal, inside the `Mezout/contracts` folder:

```
forge test --match-contract MezoutRouterV2BorrowForkTest -vv
```

For the live payment, run the following in your Mac terminal, inside the `Mezout/contracts` folder, with the repo-root `.env.local` loaded into the shell. First compute the hints with `cast` (`HintHelpers.getApproxHint`, then `SortedTroves.findInsertPosition`, the same way as the SDK's `getBorrowHints`). Then run:

```
forge script script/PayBorrowV2.s.sol:PayBorrowV2 --rpc-url $MEZO_RPC_URL
```

The script needs `MERCHANT`, `AMOUNT`, `FEE`, `FROM_BALANCE`, `ORDER_ID`, `UPPER_HINT` and `LOWER_HINT` set. It prints signed calldata. Simulate it with `cast call` against v2, then send it with `cast send` from the relayer key. Forge's local simulation cannot run the price precompile that v2 calls, which is why the script does not broadcast.
