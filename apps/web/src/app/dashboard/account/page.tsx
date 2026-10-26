"use client";

import { useState } from "react";
import { BusinessNameForm } from "@/components/dashboard/BusinessNameForm";
import { WithdrawCard } from "@/components/dashboard/WithdrawCard";
import { useMerchant } from "@/lib/merchant";

const EXPLORER = "https://explorer.test.mezo.org/address";

export default function AccountPage() {
  const { address, method, passkey, signOut } = useMerchant();
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);

  return (
    <div className="space-y-6">
      <BusinessNameForm variant="settings" />

      <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Payout account</h2>
          <p className="text-sm text-stone-600">
            {method === "passkey"
              ? "A smart account controlled by your passkey. Customers pay into it, and only your passkey can move funds out."
              : "Your own wallet. Customers pay into it directly, and refunds are sent from it."}
          </p>
        </div>
        <div className="space-y-2 rounded-lg bg-stone-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            {method === "passkey" ? "Passkey account" : "Wallet"} address
          </p>
          <p className="break-all font-mono text-sm">{address}</p>
          <div className="flex flex-wrap gap-3 text-sm">
            <button
              onClick={() => {
                navigator.clipboard.writeText(address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="underline"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <a href={`${EXPLORER}/${address}`} target="_blank" rel="noreferrer" className="underline">
              View on explorer
            </a>
          </div>
        </div>
      </section>

      {method === "passkey" && passkey && <WithdrawCard session={passkey} />}

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white p-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Sign out</h2>
          <p className="text-sm text-stone-600">
            {method === "passkey"
              ? "Sign back in any time with the same passkey."
              : "This also disconnects your wallet from Mezout. Sign back in with the same wallet."}
          </p>
        </div>
        <button
          disabled={leaving}
          onClick={async () => {
            setLeaving(true);
            await signOut();
          }}
          className="rounded-lg border border-stone-300 px-4 py-2 hover:bg-stone-100 disabled:opacity-50"
        >
          {leaving ? "Signing out…" : "Sign out"}
        </button>
      </section>
    </div>
  );
}
