"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  AmountBreakdown,
  Alert,
  Button,
  Card,
  CardHeader,
  CopyButton,
  DownloadIcon,
  ExternalLink,
  Field,
  PlusIcon,
  ShareIcon,
  UnitInput,
  buttonClass,
  cardClass,
  inputClass,
  relativeTime,
  useToast,
} from "@/components/ui";
import { api, errorText } from "@/lib/api";

type Created = { url: string; orderId: string; expiry: string; amount: string; fee: string; net: string };

/** How long a link stays payable; the dashboard route accepts 5 minutes to 30 days. */
const EXPIRY = [
  { minutes: 60, label: "1 hour" },
  { minutes: 24 * 60, label: "24 hours" },
  { minutes: 7 * 24 * 60, label: "7 days" },
  { minutes: 30 * 24 * 60, label: "30 days" },
];

const AMOUNT = /^\d+(\.\d{1,18})?$/;

/** Why an amount can't be used, or null when it can. Empty is only an error once the merchant tries to submit. */
function amountProblem(value: string, submitting = false) {
  const v = value.trim();
  if (!v) return submitting ? "Enter an amount" : null;
  if (!AMOUNT.test(v)) return "Use digits and a dot, such as 25 or 25.50";
  if (Number(v) <= 0) return "Enter an amount above 0";
  return null;
}

/** Creates a payment link for the signed-in merchant and shows it as a link and QR code, with gross, fee and net. */
export function PaymentLinkForm({ onCreated }: { onCreated?: () => void }) {
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const [reference, setReference] = useState("");
  const [ttlMinutes, setTtlMinutes] = useState(24 * 60);
  const [created, setCreated] = useState<(Created & { reference: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const amountRef = useRef<HTMLInputElement>(null);

  const amountError = touched ? amountProblem(amount) : null;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const problem = amountProblem(amount, true);
    if (problem) {
      setTouched(true);
      amountRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const link = await api<Created>("/api/invoices", { body: { amount: amount.trim(), reference: reference || undefined, ttlMinutes } });
      setCreated({ ...link, reference });
      setAmount("");
      setReference("");
      setTouched(false);
      toast("Payment link created");
      onCreated?.();
    } catch (err) {
      setError(errorText(err, "Could not create the link. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <LinkReady
        created={created}
        onNew={() => {
          setCreated(null);
          // Let the form render, then put the cursor in the amount.
          setTimeout(() => amountRef.current?.focus(), 0);
        }}
      />
    );
  }

  return (
    <form onSubmit={create} noValidate aria-labelledby="new-link" className={`${cardClass} scroll-mt-24 space-y-5 p-6`}>
      <CardHeader
        id="new-link"
        title="Create a payment link"
        description="Your customer pays this amount with MUSD, BTC or MEZO, or borrows against BTC. You see the fee before you share it."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" error={amountError}>
          {(ids) => (
            <UnitInput
              {...ids}
              ref={amountRef}
              unit="MUSD"
              required
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="25.00"
            />
          )}
        </Field>
        <Field label="Expires after" hint="After this, the link can’t be paid.">
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
          <Field label="Reference" optional hint="An order number or a note. Your customer sees it.">
            {(ids) => (
              <input {...ids} maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} placeholder="Order 1001" />
            )}
          </Field>
        </div>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" loading={busy} className="w-full sm:w-auto">
          {busy ? "Creating…" : "Create link"}
        </Button>
      </div>
    </form>
  );
}

/** The link just made: QR code, copy, share, download and preview, then the money breakdown. */
function LinkReady({ created, onNew }: { created: Created & { reference: string }; onNew: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const qr = useRef<HTMLDivElement>(null);
  const [canShare, setCanShare] = useState(false);
  const expires = new Date(Number(created.expiry) * 1000);

  useEffect(() => {
    heading.current?.focus();
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  function downloadQr() {
    const svg = qr.current?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mezout-${(created.reference || "payment-link").replace(/[^\w-]+/g, "-").toLowerCase()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function share() {
    try {
      await navigator.share({ title: created.reference || "Payment link", text: `Pay ${created.amount} MUSD`, url: created.url });
    } catch {
      // The merchant closed the share sheet.
    }
  }

  return (
    <Card id="new-link" className="scroll-mt-24 space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 ref={heading} tabIndex={-1} className="text-[15px] font-semibold tracking-tight text-stone-900 outline-none">
            Your link is ready
          </h2>
          <p className="text-sm text-stone-600">
            {created.reference ? `${created.reference} · ` : ""}
            <span className="font-medium tabular-nums text-stone-900">{created.amount} MUSD</span> · expires{" "}
            <time dateTime={expires.toISOString()} title={expires.toLocaleString()}>
              {relativeTime(expires)}
            </time>
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onNew}>
          <PlusIcon className="h-4 w-4" />
          New link
        </Button>
      </div>

      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <div ref={qr} className="shrink-0 rounded-xl border border-stone-200 bg-white p-3">
          <QRCodeSVG value={created.url} size={152} aria-label="QR code for the payment link" role="img" />
        </div>
        <div className="w-full min-w-0 space-y-3">
          <p className="text-sm text-stone-600">Send the link to your customer, or let them scan the QR code.</p>
          <input
            readOnly
            value={created.url}
            onFocus={(e) => e.target.select()}
            aria-label="Payment link"
            className={`${inputClass} truncate bg-stone-50 font-mono`}
          />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <CopyButton text={created.url} label="Copy link" variant="primary" size="md" className="col-span-2 sm:col-span-1" />
            {canShare && (
              <Button variant="secondary" onClick={share}>
                <ShareIcon className="h-4 w-4" />
                Share
              </Button>
            )}
            <Button variant="secondary" onClick={downloadQr}>
              <DownloadIcon className="h-4 w-4" />
              QR code
            </Button>
            <ExternalLink href={created.url} className={buttonClass("secondary", "md", canShare ? "col-span-2 sm:col-span-1" : "")} iconClassName="h-4 w-4">
              Preview checkout
            </ExternalLink>
          </div>
        </div>
      </div>
      <div className="rounded-lg bg-stone-50 px-4 py-2">
        <AmountBreakdown gross={created.amount} fee={created.fee} net={created.net} compact />
      </div>
      <p className="text-xs text-stone-500">Once it’s paid, it shows up under Payments on its own, usually within seconds.</p>
    </Card>
  );
}
