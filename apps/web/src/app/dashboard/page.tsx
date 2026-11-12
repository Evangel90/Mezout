"use client";

import { BusinessNameForm } from "@/components/dashboard/BusinessNameForm";
import { GettingStarted } from "@/components/dashboard/GettingStarted";
import { OverviewStats } from "@/components/dashboard/OverviewStats";
import { PaymentLinkForm } from "@/components/dashboard/PaymentLinkForm";
import { OrdersPanel } from "@/components/OrdersPanel";
import { PageHeader, PlusIcon, buttonClass } from "@/components/ui";
import { useMerchant } from "@/lib/merchant";
import { useOrders } from "@/lib/useOrders";

export default function OverviewPage() {
  const { businessName } = useMerchant();
  const orders = useOrders();
  return (
    <>
      <PageHeader
        title="Overview"
        description="Create a payment link, share it, and see payments arrive."
        action={
          <a href="#new-link" className={buttonClass("primary", "sm")}>
            <PlusIcon className="h-4 w-4" />
            New payment link
          </a>
        }
      />
      {!businessName && <BusinessNameForm variant="prompt" />}
      <GettingStarted orders={orders.orders} />
      <OverviewStats orders={orders.orders} />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <PaymentLinkForm onCreated={orders.reload} />
        <OrdersPanel state={orders} limit={5} />
      </div>
    </>
  );
}
