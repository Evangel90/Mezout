"use client";

import { BalanceCard } from "@/components/dashboard/BalanceCard";
import { PaymentLinkForm } from "@/components/dashboard/PaymentLinkForm";
import { OrdersPanel } from "@/components/OrdersPanel";

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <BalanceCard />
      <PaymentLinkForm />
      <OrdersPanel limit={5} />
    </div>
  );
}
