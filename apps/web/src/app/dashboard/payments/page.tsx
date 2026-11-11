"use client";

import { OrdersPanel } from "@/components/OrdersPanel";
import { Button, DownloadIcon, PageHeader, RefreshIcon, buttonClass } from "@/components/ui";
import { useOrders } from "@/lib/useOrders";

export default function PaymentsPage() {
  const orders = useOrders();
  return (
    <>
      <PageHeader
        title="Payments"
        description="Every payment, its fee and what you received. Open one to see details or send a refund."
        action={
          <>
            <Button variant="secondary" size="sm" onClick={orders.reload} loading={orders.refreshing && orders.orders !== null}>
              {!orders.refreshing && <RefreshIcon className="h-4 w-4" />}
              Refresh
            </Button>
            <a href="/api/dashboard/orders?format=csv" className={buttonClass("secondary", "sm")}>
              <DownloadIcon className="h-4 w-4" />
              Export CSV
            </a>
          </>
        }
      />
      <OrdersPanel state={orders} />
      <p className="text-xs text-stone-500">
        Payments appear once Mezo confirms them, usually within seconds, and this page updates on its own. Refunds go from
        your payout account straight back to the customer. Mezout never holds the funds.
      </p>
    </>
  );
}
