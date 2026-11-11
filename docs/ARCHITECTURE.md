# How Mezout works

The diagrams behind the [README](../README.md): the system, each payment path, passkey accounts, and the invoice and WooCommerce lifecycles. For the API, see [`API.md`](API.md).

## Architecture

Mezout has three layers. The **contracts** enforce every money rule. The **app** signs invoices, relays payments and runs the merchant platform. **Integrations** connect stores. The app is never trusted with funds: it can only submit transactions that customers and merchants have signed.

```mermaid
flowchart TB
    subgraph People[" "]
        direction LR
        CU["Customer<br/>EVM or Bitcoin wallet<br/>via Mezo Passport"]
        ME["Merchant<br/>passkey or Mezo wallet"]
        ST["Merchant's store<br/>own backend or WooCommerce"]
    end

    subgraph App["Mezout app on Vercel"]
        direction LR
        CO["Hosted checkout<br/>/pay"]
        RL["Relayer<br/>pays the gas"]
        DA["Dashboard and REST API<br/>signs EIP-712 invoices"]
        WD["Passkey withdrawals<br/>acts as the bundler"]
        IX["Indexer and webhooks<br/>runs every 5 minutes"]
        DB[("Postgres · Neon")]
    end

    subgraph Mezo["Mezo testnet"]
        direction LR
        RT["MezoutRouter<br/>no owner, holds nothing"]
        MU["MUSD and borrowing<br/>troves · PriceFeed"]
        TG["Tigris pools<br/>BTC/MUSD · MEZO/MUSD"]
        EP["EntryPoint v0.7"]
        AC["Merchant payout address<br/>MezoutAccount or wallet"]
    end

    CU -- "opens link, signs once" --> CO
    CO -- "signed payment" --> RL
    RL -- "submits" --> RT
    ST -- "creates invoice" --> DA
    ME -- "links, refunds, keys" --> DA
    DA --> DB
    RT -- "permit, borrow, 160% check" --> MU
    RT -- "exact-output swap" --> TG
    RT -- "exact MUSD" --> AC
    ME -- "withdraws with passkey" --> WD
    WD -- "handleOps" --> EP
    EP -- "validates WebAuthn" --> AC
    IX -- "reads Paid events" --> RT
    IX --> DB
    IX -- "signed invoice.paid" --> ST
```

## How a payment flows

### End to end: from a store's order to fulfilment

A store creates an invoice, the customer pays on the hosted checkout, and the store learns about the payment from a signed webhook. Paid status comes from the chain, never from the customer's browser.

```mermaid
sequenceDiagram
    autonumber
    participant S as Store backend
    participant A as Mezout API
    actor C as Customer
    participant K as Hosted checkout
    participant R as Relayer
    participant M as MezoutRouter
    participant I as Indexer

    S->>A: POST /v1/invoices with amount, reference and Idempotency-Key
    A->>A: Sign EIP-712 Invoice: merchant, amount, fee, orderId, expiry
    A-->>S: Invoice id and checkout_url
    S-->>C: Redirect to checkout_url
    C->>K: Open link, connect wallet with Mezo Passport
    K->>K: Read balances, Tigris quotes and trove, show usable options
    C->>K: Choose a method, sign Payment and token permit
    K->>R: POST /api/relay
    R->>M: Simulate, then submit. Relayer pays the gas
    M->>M: Check invoice signature, payer signature, expiry, not already paid
    M->>M: Take the invoiced amount; send merchant net MUSD and the signed fee to its recipient
    M-->>I: Paid event
    K->>I: Ask for a sync now
    I->>I: Record the payment, queue invoice.paid
    I->>S: POST webhook with Mezout-Signature
    S->>S: Verify signature, mark order paid, fulfil
    K-->>C: Payment complete, return to store
```

If the indexer's request from the checkout is missed, the scheduled run every 5 minutes catches the payment, and reading an unpaid invoice triggers a sync when the index is stale.

### What the checkout offers

The checkout only shows options that will succeed for this wallet, so a customer never signs something that reverts.

```mermaid
flowchart TD
    A["Customer connects a wallet"] --> B{"Wallet type?"}
    B -- "EVM wallet" --> E["Relayed, gasless payments"]
    B -- "Bitcoin wallet<br/>smart account in Passport" --> F["Approve and pay directly,<br/>customer pays a small gas fee"]

    E --> M1{"MUSD balance covers invoice?"}
    M1 -- yes --> O1["Pay with MUSD"]
    E --> S1{"BTC or MEZO covers<br/>live quote + 1% cap?"}
    S1 -- yes --> O2["Pay with BTC / MEZO"]
    E --> T1{"Trove active, not Recovery Mode,<br/>ratio after borrow at least 160%,<br/>within borrowing capacity?"}
    T1 -- yes --> O3["Borrow against BTC<br/>optionally use MUSD balance first"]

    F --> M2{"MUSD balance covers invoice?"}
    M2 -- yes --> O4["Pay with MUSD"]
    F --> S2{"BTC or MEZO covers quote + 1% cap,<br/>keeping BTC for gas?"}
    S2 -- yes --> O5["Pay with BTC / MEZO"]
```

Bitcoin wallets in Mezo Passport act through smart accounts, which cannot sign the permits that MUSD and Mezo's borrowing contracts require, so those customers approve the router and call it themselves. Borrowing is offered only to EVM wallets for the same reason.

### Pay with BTC or MEZO: exact-output swap

Tigris has no exact-output swap, and the router must receive the full signed invoice amount before splitting merchant net settlement and the platform fee. It computes, at execution, the smallest input that buys exactly that MUSD amount, and takes only that.

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant K as Checkout
    participant R as Relayer
    participant M as MezoutRouter
    participant P as Tigris pool
    participant W as Merchant

    K->>M: quoteSwapIn(BTC, 25 MUSD)
    M-->>K: 0.000318 BTC
    K->>C: Show quote, cap = quote + 1%, valid 5 minutes
    C->>K: Sign SwapPayment for invoice, token, cap, deadline
    C->>K: Sign BTC permit for the cap
    K->>R: POST /api/relay
    R->>M: payWithBTC
    M->>M: Quote not expired, invoice and payer signatures valid
    M->>P: Read reserves and fee, compute least input for exact output
    alt input above the signed cap
        M-->>R: Revert SlippageExceeded, nothing charged
    else within cap
        M->>P: Move exactly that BTC from customer to pool
        P->>M: Exactly 25 MUSD
        M->>M: Check received equals invoice amount
        M->>W: 25 MUSD minus fee
    end
```

BTC is paid through Mezo's BTC ERC-20, which shares its balance with native BTC and supports permits, so a relayer can submit a BTC payment without the customer sending a transaction. Nothing is left in the router to refund.

### Borrow against BTC: guarded by a 160% floor

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant K as Checkout
    participant R as Relayer
    participant M as MezoutRouter
    participant B as Mezo borrowing
    participant W as Merchant

    K->>B: Read trove, price, Recovery Mode, borrowing capacity
    K->>C: Offer borrow only if the loan stays at or above 160%
    C->>K: Sign Payment and an MUSD permit for the invoice
    C->>K: Sign WithdrawMUSD naming the customer as recipient
    K->>R: POST /api/relay
    R->>R: Find sorted-trove hints
    R->>M: payWithBorrow
    M->>B: withdrawMUSDWithSignature, borrowed MUSD to customer
    M->>M: Pull the invoice from customer under permit
    M->>W: Net MUSD settlement
    M->>B: getCurrentICR(customer)
    alt below 160%
        M-->>R: Revert TroveBelowSafetyFloor, whole payment undone
    else at or above 160%
        M-->>R: Paid, borrowed amount recorded
    end
```

The customer keeps their BTC, the merchant is paid in full, and the loan stays well inside Mezo's own 110% liquidation threshold.

### Passkey merchant accounts and gasless withdrawals

There is no public ERC-4337 bundler on Mezo, so Mezout's relayer acts as one. It only ever submits a single MUSD transfer out of a registered account, and it cannot sign for the account.

```mermaid
sequenceDiagram
    autonumber
    actor M as Merchant
    participant B as Browser passkey
    participant D as Mezout server
    participant F as MezoutAccountFactory
    participant E as EntryPoint v0.7
    participant A as MezoutAccount

    rect rgba(128, 128, 128, 0.12)
    Note over M,F: Sign up, no wallet and no transaction
    M->>B: Create account with passkey
    B-->>D: P-256 public key
    D->>F: getAddress(public key), CREATE2
    F-->>D: Account address, ready to receive MUSD now
    end

    rect rgba(128, 128, 128, 0.12)
    Note over M,A: Withdraw, gasless
    M->>D: Withdraw 20 MUSD to an address
    D->>D: Build user operation, pin nonce and fee
    D-->>B: userOpHash to sign
    B->>M: Face ID or Touch ID
    B-->>D: WebAuthn assertion
    D->>D: Rebuild the same operation, verify the passkey signature
    D->>E: Top up the account's deposit, then handleOps
    E->>A: Deploy on first use, validate WebAuthn with the P-256 precompile
    A->>A: Transfer MUSD
    end
```

The account's signer is the passkey alone. Mezout never sees the private key and cannot move the funds.

### Invoice lifecycle

```mermaid
stateDiagram-v2
    [*] --> pending: Invoice created and signed
    pending --> paid: Paid event indexed, sends invoice.paid
    pending --> expired: Expiry passed with no payment, sends invoice.expired
    paid --> paid: Partial refund, sends refund.completed
    paid --> refunded: Refunds reach the amount paid, sends refund.completed
    refunded --> [*]
    expired --> [*]
```

Mezout holds no funds, so a refund requested through the API stays pending until the merchant sends the MUSD from the dashboard. Mezout then checks the transaction on-chain before marking the refund completed, and refunds can never add up to more than the payment.

### WooCommerce order lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor C as Shopper
    participant W as WooCommerce + Mezout plugin
    participant A as Mezout
    participant M as Mezo

    C->>W: Place order, choose Mezout
    W->>A: POST /v1/invoices, Idempotency-Key per order
    A-->>W: checkout_url
    W-->>C: Redirect to hosted checkout
    C->>A: Pay
    A->>M: Relayed payment
    M-->>A: Paid event indexed
    A->>W: invoice.paid webhook
    W->>W: Verify signature and amount, mark order paid
    C->>W: Back on order-received page, reloads until confirmed
    Note over W,A: Link expires unpaid: invoice.expired cancels the order
    Note over W,A: Refund from the order screen: POST /v1/refunds, completed from the dashboard
```

Saving the plugin settings checks the API key and registers the store's webhook endpoint automatically, so the merchant only pastes one key.

## Hard problems we solved

- **Mezo's signatures only work for regular wallets.** MUSD permits and `withdrawMUSDWithSignature` use plain ECDSA with no ERC-1271 support, so Bitcoin wallets in Passport (smart accounts) can't sign them. Gasless relayed payments serve EVM wallets, and a separate direct path lets smart accounts approve and pay themselves.
- **Tigris has no exact-output swap.** The router computes the least input that buys exactly the invoiced MUSD, fee included, from the pool's reserves at execution. The formula is fuzzed and fork-tested against the real BTC/MUSD pool: the quote passes and the quote minus 1 wei reverts.
- **No ERC-4337 bundler on Mezo.** The relayer calls `handleOps` itself and tops up each account's EntryPoint deposit. OpenZeppelin 5.6 defaults to EntryPoint v0.9, but Mezo has v0.7, so the account overrides it. Mezo's P-256 precompile makes passkey checks cheap.
- **Borrow limits go beyond the 160% ratio.** A trove also has a `maxBorrowingCapacity` fixed when it was opened, and Recovery Mode changes the rules, so checkout reads both before offering the borrow option.
- **No MUSD/MEZO liquidity on testnet.** We created and seeded our own Tigris pool.
- **The explorer can't verify Cancun builds.** The contracts need transient storage, so they are verified on Sourcify instead, with exact matches.

The full list, with what we learned, is in [`docs/SUBMISSION-ANSWERS.md`](SUBMISSION-ANSWERS.md). What we checked on-chain before designing anything is in [`docs/M0-findings.md`](M0-findings.md).

