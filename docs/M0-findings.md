# M0 findings — setup and verification

As of 24 Oct 2026. Sources: `mezo-org/musd` @ `de1ec2af` (`solidity/artifacts/deployments/matsnet`), npm `@mezo-org/musd-contracts` 1.1.0, `mezo-org/tigris` @ `0a3b5e8` (`solidity/deployments/testnet`), Mezo docs `contracts-reference.md`, and read-only `cast` calls against `https://rpc.test.mezo.org` (chain 31611).

## Status of the M0 checklist

| Item | Status | Evidence |
| --- | --- | --- |
| Monorepo scaffolded; `pnpm install` and `forge build` pass | Done | Layout per brief; Next.js 14.2.35 (Mezo Passport needs React 18) |
| Every address confirmed, missing ones found | Done | Table below; also in `contracts/test/utils/MezoTestnet.sol` |
| Fork test reads a real trove and its ratio, price pinned | Done | `contracts/test/fork/TroveRead.fork.t.sol` |
| `WithdrawMUSD` typed data and MUSD permit domain confirmed | Done | Source lines below; `contracts/test/fork/SignatureDomains.fork.t.sol` |

## Addresses (Mezo testnet)

| Contract | Address | Matches brief |
| --- | --- | --- |
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` | Yes |
| BorrowerOperations (proxy) | `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` | Yes |
| BorrowerOperationsSignatures (proxy) | `0xD757e3646AF370b15f32EB557F0F8380Df7D639e` | Yes |
| TroveManager (proxy) | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` | Yes |
| HintHelpers (proxy) | `0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6` | New |
| SortedTroves (proxy) | `0x722E4D24FD6Ff8b0AC679450F3D91294607268fA` | New |
| PriceFeed (proxy) | `0x86bCF0841622a5dAC14A313a15f96A95421b9366` | New |
| ActivePool (proxy) | `0x143A063F62340DA3A8bEA1C5642d18C6D0F7FF51` | New |
| BTC ERC-20 (precompile, 18 dec) | `0x7b7C000000000000000000000000000000000000` | New |
| MEZO token (precompile, 18 dec, has permit) | `0x7B7c000000000000000000000000000000000001` | New |
| BTC/USD oracle (precompile) | `0x7b7c000000000000000000000000000000000015` | New |
| Tigris Router | `0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9` | New |
| Tigris PoolFactory | `0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A` | New |
| Tigris MUSD/BTC volatile pool | `0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9` | New |
| MUSD (mainnet) | `0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186` | Yes |

Ignore the look-alike "MUSD" token at `0xCa54…F234D` (it has a BTC pool on Tigris) and the separate `matsnet_fuzz` deployment set.

## Protocol facts, checked

| Fact | Brief | On-chain / source |
| --- | --- | --- |
| Minimum net debt | 1,800 MUSD | 1,800 MUSD |
| MCR / CCR | 110% / 150% | 110% / 150% |
| Borrowing fee | 0.1% | 0.1%, added to trove debt, not taken from the amount |
| Gas compensation | 200 MUSD | 200 MUSD |
| Refinancing fee | — | 20% (not in brief) |
| System ratio at block 16,339,309 | — | 289.6%, not in Recovery Mode |
| EVM version | — | Shanghai and Cancun opcodes execute (PUSH0, TLOAD, MCOPY probed); router uses `cancun` |

- **`withdrawMUSDWithSignature`** (`BorrowerOperationsSignatures.sol` 461–499, 604–627): `(uint256 amount, address upperHint, address lowerHint, address borrower, address recipient, bytes signature, uint256 deadline)`. Typehash `WithdrawMUSD(uint256 amount,address borrower,address recipient,uint256 nonce,uint256 deadline)`, domain ("BorrowerOperationsSignatures", "1"). `recipient` is any address except the protocol pools, so it can be the merchant or the router. Anyone may submit it. Nonce per borrower via `getNonce`. Hints are not signed.
- **MUSD permit:** OpenZeppelin `ERC20Permit`, domain ("Mezo USD", "1").
- **PriceFeed:** reads the precompile oracle with `latestRoundData()`, reverts if older than 60 s. On a Foundry fork it reverts; tests mock the oracle's `decimals` and `latestRoundData`.

## Findings that change the brief — owner decisions needed

1. **Signatures are EOA-only.** Both MUSD permit and `withdrawMUSDWithSignature` verify with plain `ECDSA.recover`, with no ERC-1271 support. Gasless MUSD and BORROW payments work for EVM wallets such as MetaMask. If Mezo Passport's Bitcoin wallets (Xverse, Unisat) run through smart accounts, they cannot produce these signatures and need a direct path: the customer's account sends approve plus the router call itself and pays its own gas. Still to verify in M1: what Passport's Bitcoin-wallet accounts are. **Proposal:** in M1, the end-to-end demo uses an EVM wallet through the relayer, and Bitcoin-wallet support is added as the direct path once verified.
2. **Tigris has no exact-output swap.** The router offers only `swapExactTokensForTokens(amountIn, amountOutMin, routes, to, deadline)`. **Proposal for M2:** quote `amountIn` off-chain with a small buffer, swap exact-input with `amountOutMin = invoice amount`, pay the merchant exactly the amount, and send any surplus MUSD back to the payer. The merchant invariant holds; the payer gets leftovers in MUSD instead of BTC or MEZO.
3. **No MUSD/MEZO liquidity on testnet.** The only MEZO pool is MEZO/stMEZO with 10 tokens per side. The MEZO path cannot work on testnet unless we create and seed a MUSD/MEZO pool ourselves with test tokens, or drop MEZO from v1. Needed by M2 (31 Oct).
4. **BTC needs the ERC-20 form.** Tigris takes no native BTC. Native BTC and the precompile ERC-20 share a balance, so `payWithBTC` can take `msg.value` and approve the BTC ERC-20 to Tigris. This has to be proven on real testnet, because the precompile does not run on a fork.
5. **Extra borrow limits.** Besides the 160% floor and Recovery Mode, debt cannot exceed the trove's `maxBorrowingCapacity`, a cap fixed at 110% of the price when the trove was opened. Checkout must read it before offering BORROW.
6. **Fee room in the router.** The owner confirmed a fee after the buildathon. Because the router cannot be upgraded, the invoice should carry a signed `fee` field now (set to 0) plus a fixed fee recipient, so turning on a fee later needs no redeploy. The locked decision says the merchant always receives the exact invoiced amount, so the fee is either paid by the customer on top or deducted from the merchant's payout. **Owner to choose which.**
7. **Protocol contracts are upgradeable proxies.** Mezo governance can change their behaviour; the fork tests pin a block and should be re-run before each deploy.

## How to re-run the checks

In your Mac terminal, inside the `Mezout/contracts` folder:

```
forge test -vv
```

Fork tests use `MEZO_RPC_URL` if set, otherwise `https://rpc.test.mezo.org`, pinned at block 16,339,000.
