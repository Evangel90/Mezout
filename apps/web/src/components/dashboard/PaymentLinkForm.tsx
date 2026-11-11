"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AmountBreakdown, Alert, Button, Card, CardHeader, CopyButton, ExternalIcon, Field, UnitInput, buttonClass, cardClass, inputClass } from "@/components/ui";
import { api, errorText } from "@/lib/api";

type Created = { url: string; orderId: string; expiry: string; amount: string; fee: string; net: string };

/** How long a link stays payable; the dashboard route accepts 5 minutes to 30 days. */
const EXPIRY = [
  { minutes: 60, label: "1 hour" },
  { minutes: 24 * 60, label: "24 hours" },
  { minutes: 7 * 24 * 60, label: "7 days" },
  { minutes: 30 * 24 * 60, label: "30 days" },
];

/** Creates a payment link for the signed-in merchant and shows it as a link and QR code, with gross, fee and net. */
export function PaymentLinkForm({ onCreated }: { onCreated?: () => void }) {
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [ttlMinutes, setTtlMinutes] = useState(24 * 60);
  const [created, setCreated] = useState<(Created & { reference: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const link = await api<Created>("/api/invoices", { body: { amount, reference: reference || undefined, ttlMinutes } });
      setCreated({ ...link, reference });
      setAmount("");
      setReference("");
      onCreated?.();
    } catch (err) {
      setError(errorText(err, "Could not create the link"));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <Card className="space-y-5 p-6">
        <CardHeader
          id="new-link"
          title="Payment link ready"
          description={
            <>
              {created.reference ? `${created.reference} · ` : ""}Expires {new Date(Number(created.expiry) * 1000).toLocaleString()}
            </>
          }
          action={
            <Button variant="secondary" size="sm" onClick={() => setCreated(null)}>
              New link
            </Button>
          }
        />
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <div className="shrink-0 rounded-xl border border-stone-200 bg-white p-3">
            <QRCodeSVG value={created.url} size={152} aria-label="QR code for the payment link" role="img" />
          </div>
          <div className="w-full min-w-0 space-y-4">
            <AmountBreakdown gross={created.amount} fee={created.fee} net={created.net} compact />
            <input
              readOnly
              value={created.url}
              onFocus={(e) => e.target.select()}
              aria-label="Payment link"
              className={`${inputClass} truncate bg-stone-50 font-mono text-xs`}
            />
            <div className="flex flex-wrap gap-2">
              <CopyButton text={created.url} label="Copy link" variant="primary" size="md" />
              <a href={created.url} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                Open checkout <ExternalIcon className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
        <p className="text-xs text-stone-500">Show the QR code at the till, or send the link to your customer. It appears under Payments straight away.</p>
      </Card>
    );
  }

  return (
    <form onSubmit={create} aria-labelledby="new-link" className={`${cardClass} scroll-mt-24 space-y-5 p-6`}>
        <CardHeader
          id="new-link"
          title="Create a payment link"
          description="Customers pay this amount with MUSD, BTC or MEZO, or by borrowing against BTC. You see the fee before you share it."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount">
            {(ids) => (
              <UnitInput
                {...ids}
                unit="MUSD"
                required
                inputMode="decimal"
                pattern="^\d+(\.\d{1,18})?$"
                title="A positive amount, such as 25 or 25.50"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="25.00"
              />
            )}
          </Field>
          <Field label="Expires after">
            {(ids) => (
              <select {...ids} value={ttlMinutes} onChange={(e) => setTtlMinutes(Number(e.target.value))} className={inputClass}>
                {EXPIRY.map((x) => (
                  <option key={x.minutes} value={x.minutes}>
                    {x.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field label="Reference" optional hint="Your order number or a note. The customer sees it.">
              {(ids) => (
                <input {...ids} maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} placeholder="Order 1001" />
              )}
            </Field>
          </div>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="flex justify-end">
          <Button type="submit" loading={busy}>
            {busy ? "Creating…" : "Create link"}
          </Button>
        </div>
    </form>
  );
}
