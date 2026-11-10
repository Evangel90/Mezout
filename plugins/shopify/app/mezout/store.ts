/**
 * What the app remembers about each shop and each Mezout order. The Prisma implementation is in store.server.ts;
 * tests use the in-memory one below.
 */

export interface ShopSettings {
  shop: string;
  apiKey: string;
  gatewayName: string;
  linkLifetimeHours: number;
  /** The Mezout webhook endpoint this app registered for the shop, and its signing secret. */
  webhookEndpointId: string | null;
  webhookUrl: string | null;
  webhookSecret: string | null;
  /** SHA-256 of the API key the endpoint was registered with, so a new key re-registers. */
  webhookKeyHash: string | null;
  /** The app URL last written to the shop metafield the checkout extension reads. */
  appUrlPublished: string | null;
}

export type OrderPaymentStatus = "pending" | "paid" | "expired" | "mismatch";

export interface MezoutOrderRecord {
  shop: string;
  /** Shopify's numeric order id, as a string. */
  orderId: string;
  orderGid: string;
  orderName: string;
  invoiceId: string;
  checkoutUrl: string;
  amount: string;
  expiresAt: Date;
  status: OrderPaymentStatus;
  txHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewOrderRecord = Omit<MezoutOrderRecord, "createdAt" | "updatedAt" | "txHash" | "status"> & {
  status?: OrderPaymentStatus;
};

export interface MezoutStore {
  getShop(shop: string): Promise<ShopSettings | null>;
  /** Creates or updates; fields left out keep their value. */
  saveShop(shop: string, data: Partial<Omit<ShopSettings, "shop">>): Promise<ShopSettings>;
  deleteShop(shop: string): Promise<void>;
  /** Shops with an API key, for re-registering webhooks when the app URL changes. */
  listConnectedShops(): Promise<ShopSettings[]>;

  getOrder(shop: string, orderId: string): Promise<MezoutOrderRecord | null>;
  getOrderByInvoice(shop: string, invoiceId: string): Promise<MezoutOrderRecord | null>;
  /** Inserts, or replaces the invoice of an existing (shop, orderId) record. */
  upsertOrder(record: NewOrderRecord): Promise<MezoutOrderRecord>;
  updateOrder(
    shop: string,
    orderId: string,
    data: Partial<Pick<MezoutOrderRecord, "status" | "txHash">>,
  ): Promise<void>;
  listRecentOrders(shop: string, limit: number): Promise<MezoutOrderRecord[]>;

  hasSeenEvent(shop: string, eventId: string): Promise<boolean>;
  markEventSeen(shop: string, eventId: string): Promise<void>;
}

export function defaultShopSettings(shop: string): ShopSettings {
  return {
    shop,
    apiKey: "",
    gatewayName: "",
    linkLifetimeHours: 24,
    webhookEndpointId: null,
    webhookUrl: null,
    webhookSecret: null,
    webhookKeyHash: null,
    appUrlPublished: null,
  };
}

export class MemoryStore implements MezoutStore {
  shops = new Map<string, ShopSettings>();
  orders: MezoutOrderRecord[] = [];
  events = new Set<string>();

  async getShop(shop: string) {
    const s = this.shops.get(shop);
    return s ? { ...s } : null;
  }

  async saveShop(shop: string, data: Partial<Omit<ShopSettings, "shop">>) {
    const next = { ...(this.shops.get(shop) ?? defaultShopSettings(shop)), ...data, shop };
    this.shops.set(shop, next);
    return { ...next };
  }

  async deleteShop(shop: string) {
    this.shops.delete(shop);
  }

  async listConnectedShops() {
    return [...this.shops.values()].filter((s) => s.apiKey !== "").map((s) => ({ ...s }));
  }

  async getOrder(shop: string, orderId: string) {
    const o = this.orders.find((r) => r.shop === shop && r.orderId === orderId);
    return o ? { ...o } : null;
  }

  async getOrderByInvoice(shop: string, invoiceId: string) {
    const o = this.orders.find((r) => r.shop === shop && r.invoiceId === invoiceId);
    return o ? { ...o } : null;
  }

  async upsertOrder(record: NewOrderRecord) {
    const now = new Date();
    const i = this.orders.findIndex((r) => r.shop === record.shop && r.orderId === record.orderId);
    const prev = i >= 0 ? this.orders[i] : null;
    const next: MezoutOrderRecord = {
      txHash: null,
      createdAt: prev?.createdAt ?? now,
      ...prev,
      ...record,
      status: record.status ?? "pending",
      updatedAt: now,
    };
    if (i >= 0) this.orders[i] = next;
    else this.orders.push(next);
    return { ...next };
  }

  async updateOrder(shop: string, orderId: string, data: Partial<Pick<MezoutOrderRecord, "status" | "txHash">>) {
    const o = this.orders.find((r) => r.shop === shop && r.orderId === orderId);
    if (o) Object.assign(o, data, { updatedAt: new Date() });
  }

  async listRecentOrders(shop: string, limit: number) {
    return this.orders
      .filter((r) => r.shop === shop)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async hasSeenEvent(shop: string, eventId: string) {
    return this.events.has(`${shop}:${eventId}`);
  }

  async markEventSeen(shop: string, eventId: string) {
    this.events.add(`${shop}:${eventId}`);
  }
}
