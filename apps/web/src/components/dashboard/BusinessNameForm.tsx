"use client";

import { useState } from "react";
import { Alert, Button, CardHeader, cardClass, inputClass } from "@/components/ui";
import { errorText } from "@/lib/api";
import { useMerchant } from "@/lib/merchant";

/**
 * Sets the business name customers see at checkout. "prompt" is the Overview nudge shown while no name is set;
 * "settings" is the Account tab card.
 */
export function BusinessNameForm({ variant }: { variant: "prompt" | "settings" }) {
  const { businessName, setBusinessName, method } = useMerchant();
  const [name, setName] = useState(businessName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      setName((await setBusinessName(name)) ?? "");
      setSaved(true);
    } catch (err) {
      setError(errorText(err, "Could not save the name"));
    } finally {
      setBusy(false);
    }
  }

  const prompt = variant === "prompt";
  const unchanged = !prompt && name.trim() === (businessName ?? "");
  return (
    <form
      id="business-name"
      onSubmit={save}
      aria-labelledby="business-name-title"
      className={`scroll-mt-24 space-y-4 p-6 ${prompt ? "rounded-xl border border-amber-200 bg-amber-50/70" : cardClass}`}
    >
      <CardHeader
        id="business-name-title"
        title={prompt ? "Add your business name" : "Business name"}
        description={
          prompt
            ? `Customers see it when they pay, instead of your ${method === "passkey" ? "account" : "wallet"} address.`
            : "Shown to customers at checkout. Leave it empty to show your payout address instead."
        }
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          required={prompt}
          maxLength={64}
          autoComplete="organization"
          placeholder="Satoshi's Coffee Store"
          aria-label="Business name"
          className={`${inputClass} sm:flex-1`}
        />
        <Button type="submit" loading={busy} disabled={unchanged}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
      {saved && !prompt && <p role="status" className="text-sm text-green-800">Saved.</p>}
      {error && <Alert tone="danger">{error}</Alert>}
    </form>
  );
}
