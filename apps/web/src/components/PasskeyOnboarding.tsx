"use client";

import { useEffect, useState } from "react";
import { createPasskeyAccount, signInWithPasskey, type PasskeySession } from "@/lib/passkey";

/** First screen for merchants without a wallet: create or reuse a passkey account. */
export function PasskeyOnboarding({ onSession }: { onSession: (session: PasskeySession) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"create" | "signin" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => setSupported(typeof window !== "undefined" && "PublicKeyCredential" in window), []);

  async function run(kind: "create" | "signin", action: () => Promise<PasskeySession>) {
    setBusy(kind);
    setError(null);
    try {
      onSession(await action());
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(/not registered/.test(message) ? message : "The passkey request was cancelled or failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5 rounded-xl border border-stone-200 bg-white p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Start accepting MUSD, no wallet needed</h2>
        <p className="text-sm text-stone-600">
          Create a Mezout account secured by a passkey (Face ID, Touch ID, Windows Hello or your phone). Payments land in
          your own smart account; Mezout never holds your funds or your key.
        </p>
      </div>
      {!supported ? (
        <p className="text-sm text-amber-800">This browser does not support passkeys. Connect a wallet instead.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run("create", () => createPasskeyAccount(name.trim() || "Mezout merchant"));
          }}
          className="space-y-3"
        >
          <label className="block space-y-1">
            <span className="text-sm font-medium">Business name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              placeholder="Satoshi's Coffee"
              className="w-full rounded-lg border border-stone-300 px-3 py-2"
            />
            <span className="block text-xs text-stone-500">Shown in your device&apos;s passkey list.</span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              disabled={busy !== null}
              className="rounded-lg bg-stone-900 px-4 py-2 text-white hover:bg-stone-700 disabled:opacity-50"
            >
              {busy === "create" ? "Creating…" : "Create account with passkey"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("signin", signInWithPasskey)}
              className="rounded-lg border border-stone-300 px-4 py-2 hover:bg-stone-100 disabled:opacity-50"
            >
              {busy === "signin" ? "Waiting…" : "Sign in with passkey"}
            </button>
          </div>
        </form>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <p className="border-t border-stone-200 pt-4 text-sm text-stone-600">
        Already have a Mezo wallet? Use <span className="font-medium">Connect Wallet</span> above to be paid there instead.
      </p>
    </div>
  );
}
