"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "@/lib/api";

/** One line of the dashboard's order list (see listOrders in lib/server/orders.ts). */
export type Order = {
  invoiceId: string | null;
  orderId: string;
  reference: string | null;
  amount: string;
  fee: string;
  net: string;
  status: "pending" | "paid" | "expired" | "refunded";
  refunded: string;
  method: string | null;
  payer: string | null;
  paymentId: string | null;
  txHash: string | null;
  paidAt: string | null;
  createdAt: string;
  pendingRefund: { id: string; amount: string } | null;
};

export type OrdersState = {
  orders: Order[] | null;
  error: string | null;
  refreshing: boolean;
  reload: () => Promise<void>;
};

/** The merchant's orders, refreshed every 15 seconds while the page is open. */
export function useOrders(): OrdersState {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      setOrders((await api<{ orders: Order[] }>("/api/dashboard/orders")).orders);
      setError(null);
    } catch (err) {
      setError(errorText(err, "Could not load payments"));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const id = setInterval(reload, 15_000);
    return () => clearInterval(id);
  }, [reload]);

  return { orders, error, refreshing, reload };
}
