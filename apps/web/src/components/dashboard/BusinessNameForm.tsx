"use client";

import { useState } from "react";
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
  return (
    <form
      onSubmit={save}
      className={`space-y-3 rounded-xl border p-6 ${prompt ? "border-amber-200 bg-amber-50" : "border-stone-200 bg-white"}`}
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{prompt ? "Add your business name" : "Business name"}</h2>
        <p className="text-sm text-stone-600">
          {prompt
            ? `Customers see it when they pay, instead of your ${method === "passkey" ? "account" : "wallet"} address.`
            : "Shown to customers at checkout and on this dashboard. Leave it empty to show your address instead."}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          required={prompt}
          maxLength={64}
          placeholder="Satoshi's Coffee Store"
          aria-label="Business name"
          className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2"
        />
        <button
          disabled={busy || (!prompt && name.trim() === (businessName ?? ""))}
          className="rounded-lg bg-stone-900 px-4 py-2 text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {saved && !prompt && <p className="text-sm text-green-800">Saved.</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
