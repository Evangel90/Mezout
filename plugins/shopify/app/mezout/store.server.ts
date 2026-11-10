import type { PrismaClient } from "@prisma/client";
import type { MezoutOrderRecord, MezoutStore, NewOrderRecord, OrderPaymentStatus, ShopSettings } from "./store";

/** MezoutStore on the app's Prisma database (SQLite in development; any Prisma provider works). */
export class PrismaMezoutStore implements MezoutStore {
  constructor(private readonly db: PrismaClient) {}

  private static shop(row: {
    shop: string;
    apiKey: string;
    gatewayName: string;
    linkLifetimeHours: number;
    webhookEndpointId: string | null;
    webhookUrl: string | null;
    webhookSecret: string | null;
    webhookKeyHash: string | null;
    appUrlPublished: string | null;
  }): ShopSettings {
    return {
      shop: row.shop,
      apiKey: row.apiKey,
      gatewayName: row.gatewayName,
      linkLifetimeHours: row.linkLifetimeHours,
      webhookEndpointId: row.webhookEndpointId,
      webhookUrl: row.webhookUrl,
      webhookSecret: row.webhookSecret,
      webhookKeyHash: row.webhookKeyHash,
      appUrlPublished: row.appUrlPublished,
    };
  }

  private static order(row: {
    shop: string;
    orderId: string;
    orderGid: string;
    orderName: string;
    invoiceId: string;
    checkoutUrl: string;
    amount: string;
    expiresAt: Date;
    status: string;
    txHash: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): MezoutOrderRecord {
    return { ...row, status: row.status as OrderPaymentStatus };
  }

  async getShop(shop: string) {
    const row = await this.db.mezoutShop.findUnique({ where: { shop } });
    return row ? PrismaMezoutStore.shop(row) : null;
  }

  async saveShop(shop: string, data: Partial<Omit<ShopSettings, "shop">>) {
    const row = await this.db.mezoutShop.upsert({
      where: { shop },
      create: { shop, ...data },
      update: data,
    });
    return PrismaMezoutStore.shop(row);
  }

  async deleteShop(shop: string) {
    await this.db.mezoutShop.deleteMany({ where: { shop } });
  }

  async listConnectedShops() {
    const rows = await this.db.mezoutShop.findMany({ where: { NOT: { apiKey: "" } } });
    return rows.map(PrismaMezoutStore.shop);
  }

  async getOrder(shop: string, orderId: string) {
    const row = await this.db.mezoutOrder.findUnique({ where: { shop_orderId: { shop, orderId } } });
    return row ? PrismaMezoutStore.order(row) : null;
  }

  async getOrderByInvoice(shop: string, invoiceId: string) {
    const row = await this.db.mezoutOrder.findUnique({ where: { shop_invoiceId: { shop, invoiceId } } });
    return row ? PrismaMezoutStore.order(row) : null;
  }

  async upsertOrder(record: NewOrderRecord) {
    const data = { ...record, status: record.status ?? "pending" };
    const row = await this.db.mezoutOrder.upsert({
      where: { shop_orderId: { shop: record.shop, orderId: record.orderId } },
      create: data,
      update: data,
    });
    return PrismaMezoutStore.order(row);
  }

  async updateOrder(shop: string, orderId: string, data: Partial<Pick<MezoutOrderRecord, "status" | "txHash">>) {
    await this.db.mezoutOrder.updateMany({ where: { shop, orderId }, data });
  }

  async listRecentOrders(shop: string, limit: number) {
    const rows = await this.db.mezoutOrder.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: limit });
    return rows.map(PrismaMezoutStore.order);
  }

  async hasSeenEvent(shop: string, eventId: string) {
    return (await this.db.mezoutEvent.count({ where: { shop, eventId } })) > 0;
  }

  async markEventSeen(shop: string, eventId: string) {
    await this.db.mezoutEvent.upsert({
      where: { shop_eventId: { shop, eventId } },
      create: { shop, eventId },
      update: {},
    });
  }
}
