"use client";

import { useState } from "react";
import type { Address, Hex } from "viem";
import { keyRequestMessage } from "@mezout/sdk";

/** `signMessage` comes from the merchant's wallet, or from their passkey for Mezout passkey accounts. */
export function ApiKeyPanel({ address, signMessage }: { address: Address; signMessage: (message: string) => Promise<Hex> }) {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const issuedAt = new Date().toISOString();
      const signature = await signMessage(keyRequestMessage(address, issuedAt));
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, issuedAt, signature }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not create the key");
      setKey(json.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">API key</h2>
        <p className="text-sm text-stone-600">
          For your store or backend: create invoices with <span className="font-mono">POST /v1/invoices</span> and check
          them with <span className="font-mono">GET /v1/invoices/:id</span>. Invoices pay the address above. You confirm
          with your wallet or passkey to prove you own it; this costs no gas.
        </p>
      </div>
      {key ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-amber-800">Copy this key now. It is shown once and cannot be recovered.</p>
          <code className="block break-all rounded bg-stone-100 px-3 py-2 font-mono text-xs">{key}</code>
          <button
            onClick={() => navigator.clipboard.writeText(key)}
            className="rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100"
          >
            Copy key
          </button>
        </div>
      ) : (
        <button
          onClick={create}
          disabled={busy}
          className="rounded-lg bg-stone-900 px-4 py-2 text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {busy ? "Waiting for signature…" : "Create API key"}
        </button>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
