"use client";

import { useState } from "react";
import { createPublicClient, formatUnits, getAddress, http, isAddress, parseUnits, type Hex } from "viem";
import { mezoTestnet } from "@mezout/sdk";
import { Alert, Button, CardHeader, Dialog, ExternalIcon, Field, UnitInput, cardClass, formatAmount, inputClass } from "@/components/ui";
import { txUrl } from "@/lib/config";
import { passkeySendMusd, type PasskeySession } from "@/lib/passkey";
import { useMusdBalance } from "@/lib/useMusdBalance";

const client = createPublicClient({ chain: mezoTestnet, transport: http() });
const AMOUNT = /^\d+(\.\d{1,18})?$/;

/** Withdrawals from a passkey smart account. The passkey signs; Mezout's relayer pays the gas. */
export function WithdrawCard({ session }: { session: PasskeySession }) {
  const { balance, refresh } = useMusdBalance(session.address);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ hash: Hex; amount: string } | null>(null);

  const toError = touched && to && !isAddress(to) ? "Enter a valid Mezo address starting with 0x" : null;
  const value = AMOUNT.test(amount) ? parseUnits(amount, 18) : null;
  const amountError =
    touched && amount
      ? value === null || value === 0n
        ? "Enter an amount such as 10 or 10.50"
        : balance !== null && value > balance
          ? "That is more than your available balance"
          : null
      : null;
  const ready = isAddress(to) && value !== null && value > 0n && (balance === null || value <= balance);

  function review(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (ready) setReviewing(true);
  }

  async function withdraw() {
    setReviewing(false);
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const hash = await passkeySendMusd(session, getAddress(to), amount, (h) =>
        client.waitForTransactionReceipt({ hash: h, timeout: 90_000 }),
      );
      setDone({ hash, amount });
      setAmount("");
      setTouched(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="withdraw" onSubmit={review} aria-labelledby="withdraw-title" className={`${cardClass} scroll-mt-24 space-y-5 p-6`}>
      <CardHeader
        id="withdraw-title"
        title="Withdraw MUSD"
        description="Send MUSD from your passkey account to any Mezo address, such as an exchange or your own wallet. Mezout pays the network fee."
      />
      <div className="rounded-lg bg-stone-50 px-4 py-3">
        <p className="text-xs text-stone-500">Available</p>
        <p className="text-xl font-semibold tabular-nums">
          {balance === null ? "…" : formatAmount(formatUnits(balance, 18), 2)} <span className="text-sm font-normal text-stone-500">MUSD</span>
        </p>
      </div>
      <Field label="Send to" error={toError}>
        {(ids) => (
          <input
            {...ids}
            required
            value={to}
            onChange={(e) => setTo(e.target.value.trim())}
            onBlur={() => to && setTouched(true)}
            spellCheck={false}
            autoComplete="off"
            placeholder="0x…"
            className={`${inputClass} font-mono`}
          />
        )}
      </Field>
      <Field label="Amount" error={amountError}>
        {(ids) => (
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <UnitInput {...ids} unit="MUSD" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <Button variant="secondary" disabled={balance === null || balance === 0n} onClick={() => balance !== null && setAmount(formatUnits(balance, 18))}>
              Max
            </Button>
          </div>
        )}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" loading={busy}>
          {busy ? "Confirm with your passkey…" : "Review withdrawal"}
        </Button>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {done && (
        <Alert
          tone="success"
          title={`Sent ${formatAmount(done.amount)} MUSD`}
          action={
            <a href={txUrl(done.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium underline">
              View transaction <ExternalIcon className="h-3.5 w-3.5" />
            </a>
          }
        />
      )}

      <Dialog
        open={reviewing}
        onClose={() => setReviewing(false)}
        title="Confirm withdrawal"
        description="Check the address carefully. A withdrawal can't be reversed."
        footer={
          <>
            <Button variant="secondary" data-autofocus onClick={() => setReviewing(false)}>
              Cancel
            </Button>
            <Button onClick={withdraw}>Withdraw with passkey</Button>
          </>
        }
      >
        <dl className="space-y-2 rounded-lg bg-stone-50 p-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-stone-600">Amount</dt>
            <dd className="font-semibold tabular-nums">{amount && formatAmount(amount)} MUSD</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-stone-600">To</dt>
            <dd className="break-all font-mono text-xs">{to}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-stone-600">Network fee</dt>
            <dd>Paid by Mezout</dd>
          </div>
        </dl>
      </Dialog>
    </form>
  );
}
