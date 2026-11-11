"use client";

import { useState } from "react";
import { Alert, Button, CardHeader, cardClass, inputClass, useToast } from "@/components/ui";
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
  const toast = useToast();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setName((await setBusinessName(name)) ?? "");
      toast("Business name saved");
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
        title={prompt ? "Name your business" : "Business name"}
        description={
          prompt
            ? `Customers see it when they pay. Without it, they see your ${method === "passkey" ? "account" : "wallet"} address.`
            : "Customers see it at checkout. Leave it empty to show your payout address."
        }
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
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
      {error && <Alert tone="danger">{error}</Alert>}
    </form>
  );
}
