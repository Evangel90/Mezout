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
        description="Every payment link and invoice, with the fee and what you received. Open a payment to see its details or refund it."
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
        Payments show here once they are confirmed on Mezo, usually within seconds. Refunds go from your payout account
        straight back to the customer; Mezout never holds the funds.
      </p>
    </>
  );
}
