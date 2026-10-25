"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api, errorText } from "@/lib/api";

type Created = { url: string; orderId: string; expiry: string };

/** Creates a payment link for the signed-in merchant and shows it as a link and QR code. */
export function PaymentLinkForm() {
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [created, setCreated] = useState<(Created & { amount: string; reference: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const link = await api<Created>("/api/invoices", { body: { amount, reference: reference || undefined } });
      setCreated({ ...link, amount, reference });
      setAmount("");
      setReference("");
    } catch (err) {
      setError(errorText(err, "Could not create the link"));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Payment link ready</h2>
            <p className="text-sm text-stone-600">
              {created.amount} MUSD{created.reference && ` · ${created.reference}`} · expires{" "}
              {new Date(Number(created.expiry) * 1000).toLocaleString()}
            </p>
          </div>
          <button onClick={() => setCreated(null)} className="shrink-0 rounded border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100">
            New link
          </button>
        </div>
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <div className="shrink-0 rounded-lg border border-stone-200 bg-white p-3">
            <QRCodeSVG value={created.url} size={168} />
          </div>
          <div className="w-full min-w-0 space-y-3">
            <p className="text-sm text-stone-600">Show the QR code at the till, or send the link to your customer.</p>
            <input
              readOnly
              value={created.url}
              onFocus={(e) => e.target.select()}
              aria-label="Payment link"
              className="w-full truncate rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(created.url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-700"
              >
                {copied ? "Copied" : "Copy link"}
              </button>
              <a href={created.url} target="_blank" rel="noreferrer" className="rounded-lg border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100">
                Open checkout
              </a>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={create} className="space-y-4 rounded-xl border border-stone-200 bg-white p-6">
      <div>
        <h2 className="text-lg font-semibold">Create a payment link</h2>
        <p className="text-sm text-stone-600">Customers can pay it with MUSD, BTC or MEZO, or by borrowing against BTC. You receive the exact amount in MUSD.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
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
        <label className="block space-y-1">
          <span className="text-sm font-medium">Reference (optional)</span>
          <input
            maxLength={200}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2"
            placeholder="Order 1001"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-stone-500">Links expire after 24 hours. Platform fee: 0% during the buildathon.</p>
        <button disabled={busy} className="rounded-lg bg-stone-900 px-4 py-2 text-white hover:bg-stone-700 disabled:opacity-50">
          {busy ? "Creating…" : "Create link"}
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
