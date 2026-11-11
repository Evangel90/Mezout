"use client";

import { useState } from "react";
import { BusinessNameForm } from "@/components/dashboard/BusinessNameForm";
import { WithdrawCard } from "@/components/dashboard/WithdrawCard";
import { Button, Card, CardHeader, CopyButton, ExternalLink, PageHeader, buttonClass } from "@/components/ui";
import { useMerchant } from "@/lib/merchant";

const EXPLORER = "https://explorer.test.mezo.org/address";

export default function AccountPage() {
  const { address, method, passkey, signOut } = useMerchant();
  const [leaving, setLeaving] = useState(false);

  return (
    <>
      <PageHeader title="Account" description="Your business name, where your money goes, and withdrawals." />
      <BusinessNameForm variant="settings" />

      <Card className="space-y-4 p-6">
        <CardHeader
          title="Payout account"
          description={
            method === "passkey"
              ? "Customers pay into this account. Only your passkey can move money out."
              : "Your own wallet. Customers pay into it directly, and you send refunds from it."
          }
        />
        <div className="space-y-3 rounded-lg bg-stone-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            {method === "passkey" ? "Passkey account" : "Wallet"} address
          </p>
          <p className="break-all font-mono text-sm">{address}</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={address} label="Copy address" />
            <ExternalLink href={`${EXPLORER}/${address}`} className={buttonClass("secondary", "sm")} iconClassName="h-4 w-4">
              View on explorer
            </ExternalLink>
          </div>
        </div>
      </Card>

      {method === "passkey" && passkey && <WithdrawCard session={passkey} />}

      <Card className="p-6">
        <CardHeader
          title="Sign out"
          description={
            method === "passkey"
              ? "Sign back in any time with the same passkey."
              : "This also disconnects your wallet from Mezout. Sign back in with the same wallet."
          }
          action={
            <Button
              variant="secondary"
              loading={leaving}
              onClick={async () => {
                setLeaving(true);
                await signOut();
              }}
            >
              {leaving ? "Signing out…" : "Sign out"}
            </Button>
          }
        />
      </Card>
    </>
  );
}
