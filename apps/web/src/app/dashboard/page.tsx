"use client";

import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { QRCodeSVG } from "qrcode.react";
import { useAccount } from "wagmi";
import { ApiKeyPanel } from "@/components/ApiKeyPanel";

type Created = { url: string; orderId: string; expiry: string };

export default function Dashboard() {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ merchant: address, amount }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not create the link");
      setCreated(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Payment links</h1>
        <ConnectButton showBalance={false} />
      </div>

      {!address ? (
        <p className="text-stone-600">Connect the wallet that should receive MUSD. It becomes the payout address.</p>
      ) : (
        <form onSubmit={create} className="space-y-4 rounded-xl border border-stone-200 bg-white p-6">
          <p className="text-sm text-stone-600">
            Payout address <span className="font-mono">{address}</span>
          </p>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Amount (MUSD)</span>
            <input
              required
              inputMode="decimal"
              pattern="^\d+(\.\d{1,18})?$"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2"
              placeholder="25.00"
            />
          </label>
          <p className="text-xs text-stone-500">Links expire after 24 hours. Platform fee: 0% during the buildathon.</p>
          <button
            disabled={busy}
            className="rounded-lg bg-stone-900 px-4 py-2 text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create link"}
          </button>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </form>
      )}

      {created && (
        <div className="flex flex-col gap-6 rounded-xl border border-stone-200 bg-white p-6 sm:flex-row">
          <QRCodeSVG value={created.url} size={160} />
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-medium">Share this link or QR code with your customer</p>
            <a href={created.url} className="block break-all font-mono text-xs text-blue-700 underline">
              {created.url}
            </a>
            <button
              onClick={() => navigator.clipboard.writeText(created.url)}
              className="rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100"
            >
              Copy link
            </button>
            <p className="text-xs text-stone-500">
              Expires {new Date(Number(created.expiry) * 1000).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {address && <ApiKeyPanel address={address} />}
    </div>
  );
}
