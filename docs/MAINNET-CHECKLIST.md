# Mezo mainnet: configuration and dry-run checklist

Mezout runs on Mezo testnet (chain 31611) by default. Mainnet (chain 31612) is opt-in with `MEZO_NETWORK=mainnet`. Nothing in this checklist deploys or spends funds. The broadcast step at the end needs the owner's written approval (see the agent working rules in [`BRIEF.md`](BRIEF.md)).

## How the network is chosen

| Where | What reads it |
| --- | --- |
| `MEZO_NETWORK` in `.env.local` or the host's env (`testnet` or `mainnet`; unset means `testnet`) | `apps/web/next.config.mjs` builds it into the app as `NEXT_PUBLIC_MEZO_NETWORK`, so pages and API agree |
| `packages/sdk/src/networks.ts` | Chains, explorers, faucet, API key prefix and the address book for each network, with the source of every mainnet address |
| `apps/web/src/instrumentation.ts` → `lib/server/network.ts` | At server start: refuses a runtime `MEZO_NETWORK` that differs from the build, any address that is unverified, and on mainnet a `NEXT_PUBLIC_ROUTER_ADDRESS` that isn't the mainnet router |
| `contracts/script/config/MezoMainnet.sol` | The same mainnet addresses for Foundry. Keep it in step with the SDK |

Merchants and API keys carry their network (migration `0007`). Testnet keys start with `mzk_test_` and mainnet keys with `mzk_live_`. A key works only when its prefix, its own row and its merchant's row all name the server's network. Sign-in and key-request messages name the network, so a testnet signature never works on mainnet. Run one database per network. Payments, cursors and webhooks don't carry a network column.

## Mainnet addresses (verified 14 Nov 2026, block 13,220,720)

Every address is listed in an official Mezo source and was confirmed on chain 31612 with read-only calls through two documented RPCs (`mezo-mainnet.boar.network`, `mainnet.mezo.public.validationcloud.io`). Both RPCs gave identical results.

| Contract | Address | Source | On-chain check |
| --- | --- | --- | --- |
| MUSD | `0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186` | Mezo docs contracts reference; `mezo-org/musd` @ `da7888a1` `deployments/mainnet` | `name()` "Mezo USD", `symbol()` "MUSD", permit domain separator matches ("Mezo USD", "1", 31612) |
| BorrowerOperations | `0x44b1bac67dDA612a41a58AAf779143B181dEe031` | `mezo-org/musd` | `musd()`, `troveManager()`, `priceFeed()`, `borrowerOperationsSignaturesAddress()` match; `minNetDebt()` 1,800 MUSD |
| BorrowerOperationsSignatures | `0xB57ab578BF20b3e318f3EFAA587C51DBccE5df7a` | `mezo-org/musd` | `eip712Domain()` = ("BorrowerOperationsSignatures", "1", 31612, self) |
| TroveManager | `0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193` | `mezo-org/musd` | `musdToken()`, `sortedTroves()`, `activePool()` match; gas compensation 200 MUSD |
| HintHelpers | `0xD267b3bE2514375A075fd03C3D9CBa6b95317DC3` | `mezo-org/musd` | `troveManager()`, `sortedTroves()` match |
| SortedTroves | `0x8C5DB4C62BF29c1C4564390d10c20a47E0b2749f` | `mezo-org/musd` | `troveManager()` matches |
| PriceFeed | `0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88` | `mezo-org/musd` | `oracle()` = `0x7b7c…0015`; `fetchPrice()` live |
| BTC (precompile) | `0x7b7C000000000000000000000000000000000000` | Mezo docs contracts reference | "BTC", 18 decimals, domain separator matches ("BTC", "1", 31612) |
| MEZO (precompile) | `0x7B7c000000000000000000000000000000000001` | Mezo docs contracts reference | "MEZO", 18 decimals, domain separator matches ("MEZO", "1", 31612) |
| Tigris Router | `0x16A76d3cd3C1e3CE843C6680d6B37E9116b5C706` | `mezo-org/tigris` @ `0a3b5e84` `deployments/mainnet` | `defaultFactory()` = the documented PoolFactory |
| Tigris PoolFactory | `0x83FE469C636C4081b87bA5b3Ae9991c6Ed104248` | Mezo docs (Pool Contracts); `mezo-org/tigris` | `getPool(MUSD, BTC, false)` = the documented pool |
| Tigris MUSD/BTC pool | `0x52e604c44417233b6CcEDDDc0d640A405Caacefb` | Mezo docs (Pool Contracts) | token0 BTC, token1 MUSD, volatile, **fee 30 bps** (testnet 4 bps) |

The chain ID, explorer (`explorer.mezo.org`) and RPC providers come from the Mezo docs page `developers/getting-started/configure-environment.md`. Mainnet runs PUSH0, TSTORE/TLOAD and MCOPY (probed with `eth_call`), so the `cancun` build is valid there.

**Still missing (left `undefined`, so mainnet refuses to start):**

- **EntryPoint v0.7** (`0x0000…a032`): canonical bytecode (hash `0x8db5…fc58`) is deployed, but no Mezo doc or repo lists it. The owner needs to confirm it.
- **MezoutRouter** and **MezoutAccountFactory**: not deployed on mainnet.
- **MUSD/MEZO pool**: none is documented. MEZO payments need an owner decision before launch.

## Dry-run checklist

Run every command in your Mac terminal, inside the `Mezout/contracts` folder unless stated.

1. **Re-check the config against the chain** (read-only fork, no transactions):
   ```
   MEZO_MAINNET_RPC_URL=https://mezo-mainnet.boar.network forge test --match-contract MainnetConfigForkTest -vv
   ```
   This must pass 3 tests: deploy preflight, MUSD permit domain, and BorrowerOperationsSignatures domain.
2. **Check the precompile domains**, which Foundry can't execute on a fork. Inside `Mezout/packages/sdk`, run `pnpm test`. `networks.test.ts` checks the SDK domains against the separators read on 14 Nov. To re-read them, run `cast call 0x7b7C000000000000000000000000000000000000 "DOMAIN_SEPARATOR()(bytes32)" --rpc-url https://mezo-mainnet.boar.network`, and the same for `…0001`.
3. **Re-run the protocol fork tests** (`forge test`). Mezo's contracts are upgradeable proxies, so check that nothing changed since 14 Nov.
4. **Owner decides the two roles**: the invoice signer is a new EOA kept only for mainnet, held in a managed key service (the router checks ECDSA). The fee recipient must differ from the signer. Neither may be a testnet key.
5. **Simulate the deploy** (no `--broadcast`, no private key):
   ```
   INVOICE_SIGNER_ADDRESS=0x… FEE_RECIPIENT_ADDRESS=0x… forge script script/DeployMainnet.s.sol --rpc-url https://mezo-mainnet.boar.network
   ```
   The script reverts on the wrong chain, missing code, protocol wiring that disagrees with `MezoMainnet.sol`, or bad roles. The 14 Nov simulation used about 3.2M gas (about 0.0000084 BTC at the gas price then).
6. **Stop here.** Broadcasting needs the owner's written approval, a funded deployer, and `--broadcast --verify` per Sourcify. Afterwards, add the router (and later the account factory) to `mainnetConfig` in `packages/sdk/src/networks.ts` with its deploy transaction as the source, and set the mainnet deployment's `NEXT_PUBLIC_ROUTER_ADDRESS` to it.
7. **Start the app with `MEZO_NETWORK=mainnet`** against a separate database. It must start without an error before any merchant is onboarded.
