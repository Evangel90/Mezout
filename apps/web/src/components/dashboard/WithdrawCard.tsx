"use client";

import { useState } from "react";
import { createPublicClient, formatUnits, getAddress, http, isAddress, type Hex } from "viem";
import { mezoTestnet } from "@mezout/sdk";
import { txUrl } from "@/lib/config";
import { passkeySendMusd, type PasskeySession } from "@/lib/passkey";
import { useMusdBalance } from "@/lib/useMusdBalance";

const client = createPublicClient({ chain: mezoTestnet, transport: http() });

/** Withdrawals from a passkey smart account. The passkey signs; Mezout's relayer pays the gas. */
export function WithdrawCard({ session }: { session: PasskeySession }) {
  const { balance, refresh } = useMusdBalance(session.address);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Hex | null>(null);

  async function withdraw(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const hash = await passkeySendMusd(session, getAddress(to), amount, (h) =>
        client.waitForTransactionReceipt({ hash: h, timeout: 90_000 }),
      );
      setDone(hash);
      setAmount("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={withdraw} className="space-y-4 rounded-xl border border-stone-200 bg-white p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Withdraw MUSD</h2>
        <p className="text-sm text-stone-600">
          Available:{" "}
          <span className="font-medium text-stone-900">
            {balance === null ? "…" : Number(formatUnits(balance, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })} MUSD
          </span>
        </p>
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Send to</span>
        <input
          required
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Destination address (0x…)"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Amount</span>
        <span className="flex gap-2">
          <input
            required
            inputMode="decimal"
            pattern="^\d+(\.\d{1,18})?$"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2"
          />
          <button
            type="button"
            disabled={balance === null}
            onClick={() => balance !== null && setAmount(formatUnits(balance, 18))}
            className="rounded-lg border border-stone-300 px-3 text-sm hover:bg-stone-100 disabled:opacity-50"
          >
            Max
          </button>
        </span>
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-stone-500">No gas needed: Mezout pays the network fee.</p>
        <button disabled={busy || !isAddress(to)} className="rounded-lg bg-stone-900 px-4 py-2 text-white hover:bg-stone-700 disabled:opacity-50">
          {busy ? "Confirm with your passkey…" : "Withdraw"}
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {done && (
        <p className="text-sm text-green-800">
          Sent.{" "}
          <a href={txUrl(done)} target="_blank" rel="noreferrer" className="underline">
            View transaction
          </a>
        </p>
      )}
    </form>
  );
}
