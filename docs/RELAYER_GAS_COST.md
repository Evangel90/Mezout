# Relayer gas cost review (testnet)

Merchant fees are deducted from settlement; the payer always signs and pays the invoice's `amount`. Before changing `MERCHANT_FEE_BPS`, review the relayer's actual gas cost for each payment method from confirmed testnet transactions.

The first confirmed receipts for MUSD, hardened borrow-to-pay, BTC and MEZO are recorded in [RELAYER_GAS_EVIDENCE.md](RELAYER_GAS_EVIDENCE.md). They prove the payment paths and receipt-level gas use, but cannot set an economic MUSD fee on testnet because testnet assets have no reliable market price.

For every representative MUSD, BORROW, BTC, and MEZO payment, save its transaction hash and run:

```sh
cast receipt <transaction-hash> --rpc-url "$MEZO_RPC_URL"
```

Record `gasUsed`, `effectiveGasPrice`, and their product (`gasUsed * effectiveGasPrice`) in the Wave 2 evidence log. Compare the result with the MUSD fee collected in the router's `Paid` event. This keeps the merchant-paid rate large enough to sponsor relays without putting an undisclosed surcharge on the payer.

`MERCHANT_FEE_BPS` applies only when an invoice is created and is embedded in its signed typed data. Changing it never changes an already shared link. The testnet default is `100` (1%); set `0` to pause fees. The server rejects anything above `1000` (10%).
