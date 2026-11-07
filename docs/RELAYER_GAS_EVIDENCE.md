# Relayer gas evidence — Mezo testnet

Captured 7 November 2026 from confirmed Mezo testnet receipts using `cast receipt <tx> --rpc-url https://rpc.test.mezo.org`. Gas cost below is `gasUsed × effectiveGasPrice`, denominated in Mezo's native BTC gas unit (wei); no fiat or MUSD conversion is inferred from testnet data.

| Path | Router | Confirmed transaction | `gasUsed` | `effectiveGasPrice` | Native gas cost | Invoice / settlement evidence |
| --- | --- | --- | ---: | ---: | ---: | --- |
| MUSD permit | v1 | [`0x4f97…cc48`](https://explorer.test.mezo.org/tx/0x4f9731b8b02102690edd793177e9bdc0a4b9456109f9c217d558c5fcd05bcc48) | 138,637 | 146 wei | 20,241,002 wei (0.000000000020241002 BTC) | 100 MUSD invoice; historical fee was 0 |
| Borrow-to-pay | hardened v3 | [`0x1547…9208`](https://explorer.test.mezo.org/tx/0x1547b49437c76c1c7baf9ba9eafe2d383b284db49ba6d1f442198a566c9d9208) | 510,106 | 146 wei | 74,475,476 wei (0.000000000074475476 BTC) | 10 MUSD invoice; historical fee was 0; confirms the deployed hardened path |
| BTC swap | v2 | [`0x79d8…afff`](https://explorer.test.mezo.org/tx/0x79d84d8a7e4d523b08c757c4e0870107b3fe30d0fd9fdc7827b3e491c544afff) | 300,000 | 146 wei | 43,800,000 wei (0.0000000000438 BTC) | 1 MUSD invoice; historical fee was 0 |
| MEZO swap | v2 | [`0x3c7e…126a`](https://explorer.test.mezo.org/tx/0x3c7ea6fb940eb06f93c1d276129ab94a7dec6d625efa10422918722a0cb8126a) | 300,000 | 146 wei | 43,800,000 wei (0.0000000000438 BTC) | 2 MUSD invoice; historical fee was 0 |

## What this proves

- Each representative payment route has a successful, relayed on-chain receipt and measurable gas use.
- Borrow-to-pay evidence is from the currently deployed hardened router, not the superseded v2 router.
- The router's signed invoice schema supports the merchant-paid split: payer pays `amount`; merchant receives `amount - fee`; the configured fee recipient receives `fee`.

## What it does not prove

These historical payments predate the 1% default fee, so they do not demonstrate a nonzero `Paid.fee` settlement. Testnet BTC and MUSD do not establish an economically meaningful exchange rate, and a single receipt per route cannot represent mainnet gas variance.

## Fee decision

Keep `MERCHANT_FEE_BPS=100` (1%) as a clearly disclosed **testnet settlement-path setting**, not as a gas-cost-derived economic rate. Before any mainnet fee decision, collect multiple payments per route at live gas prices, convert each native gas cost to MUSD using a documented contemporaneous price source, add relayer operating margin, and compare that result with the signed merchant fee.

For every new evidence payment, record the transaction hash, gross `amount`, signed `fee`, merchant `net`, `gasUsed`, `effectiveGasPrice`, native gas cost, and whether the merchant and payer were independent pilot participants. The companion procedure is in [RELAYER_GAS_COST.md](RELAYER_GAS_COST.md).
