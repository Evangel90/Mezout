"use client";

import { BalanceCard } from "@/components/dashboard/BalanceCard";
import { BusinessNameForm } from "@/components/dashboard/BusinessNameForm";
import { PaymentLinkForm } from "@/components/dashboard/PaymentLinkForm";
import { OrdersPanel } from "@/components/OrdersPanel";
import { useMerchant } from "@/lib/merchant";

export default function OverviewPage() {
  const { businessName } = useMerchant();
  return (
    <div className="space-y-6">
      {!businessName && <BusinessNameForm variant="prompt" />}
      <BalanceCard />
      <PaymentLinkForm />
      <OrdersPanel limit={5} />
    </div>
  );
}
