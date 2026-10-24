"use client";

import { useCallback, useEffect, useState } from "react";
import { createPublicClient, erc20Abi, formatUnits, http, isAddress, parseEventLogs, type Hex } from "viem";
import { entryPoint07Abi } from "viem/account-abstraction";
import { mezoTestnet, mezoTestnetAddresses } from "@mezout/sdk";
import { passkeySign, type PasskeySession } from "@/lib/passkey";

const client = createPublicClient({ chain: mezoTestnet, transport: http() });
const explorerTx = (hash: Hex) => `https://explorer.test.mezo.org/tx/${hash}`;

/** Balance and withdrawals for a merchant's passkey smart account. Gas is sponsored by Mezout. */
export function PasskeyAccount({ session, onSignOut }: { session: PasskeySession; onSignOut: () => void }) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Hex | null>(null);

  const refresh = useCallback(async () => {
    const value = await client
      .readContract({ address: mezoTestnetAddresses.musd, abi: erc20Abi, functionName: "balanceOf", args: [session.address] })
      .catch(() => null);
    if (value !== null) setBalance(value);
  }, [session.address]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  async function post(body: unknown) {
    const res = await fetch("/api/account/withdraw", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Withdrawal failed");
    return json;
  }

  async function withdraw(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const { quote, userOpHash } = await post({ step: "quote", account: session.address, to, amount });
      const signature = await passkeySign(session, userOpHash);
      const { hash } = await post({ step: "submit", account: session.address, ...quote, signature });
      const receipt = await client.waitForTransactionReceipt({ hash });
      const [event] = parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationEvent", logs: receipt.logs });
      if (!event?.args.success) throw new Error("The withdrawal was rejected on-chain. Nothing was sent.");
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
    <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold">Your Mezout account</h2>
          <p className="break-all font-mono text-xs text-stone-600">{session.address}</p>
          <p className="text-xs text-stone-500">
            A smart account controlled by your passkey. Customers pay into it; only your passkey can move funds out.
          </p>
        </div>
        <button onClick={onSignOut} className="shrink-0 rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100">
          Sign out
        </button>
      </div>

      <p className="text-3xl font-semibold tracking-tight">
        {balance === null ? "…" : Number(formatUnits(balance, 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
        <span className="text-base font-normal text-stone-500">MUSD</span>
      </p>

      <form onSubmit={withdraw} className="space-y-3 border-t border-stone-200 pt-4">
        <p className="text-sm font-medium">Withdraw MUSD</p>
        <input
          required
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Destination address (0x…)"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm"
        />
        <div className="flex gap-2">
          <input
            required
            inputMode="decimal"
            pattern="^\d+(\.\d{1,18})?$"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2"
          />
          <button
            type="button"
            onClick={() => balance !== null && setAmount(formatUnits(balance, 18))}
            className="rounded-lg border border-stone-300 px-3 text-sm hover:bg-stone-100"
          >
            Max
          </button>
        </div>
        <button
          disabled={busy || !isAddress(to)}
          className="rounded-lg bg-stone-900 px-4 py-2 text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {busy ? "Confirm with your passkey…" : "Withdraw"}
        </button>
        <p className="text-xs text-stone-500">No gas needed: Mezout pays the network fee.</p>
        {error && <p className="text-sm text-red-700">{error}</p>}
        {done && (
          <p className="text-sm text-green-800">
            Sent.{" "}
            <a href={explorerTx(done)} target="_blank" rel="noreferrer" className="underline">
              View transaction
            </a>
          </p>
        )}
      </form>
    </div>
  );
}
