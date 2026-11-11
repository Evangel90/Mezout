/**
 * The Shopify Admin GraphQL calls the app makes, behind a small interface so tests can replace Shopify.
 * `graphql` has the same shape as the `admin.graphql` client from @shopify/shopify-app-react-router.
 */

export type AdminGraphql = (
  query: string,
  options?: { variables?: Record<string, unknown> },
) => Promise<{ json(): Promise<unknown> }>;

export interface ShopifyOrderState {
  id: string;
  name: string;
  displayFinancialStatus: string | null;
  cancelledAt: string | null;
  note: string | null;
  outstandingAmount: string;
  outstandingCurrency: string;
}

export const METAFIELD_NAMESPACE = "mezout";

export class ShopifyAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopifyAdminError";
  }
}

interface GraphqlResult<T> {
  data?: T;
  errors?: unknown;
}

type UserErrors = { userErrors?: { field?: string[] | null; message: string }[] } | null | undefined;

export class ShopifyAdmin {
  constructor(private readonly graphql: AdminGraphql) {}

  private async run<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await this.graphql(query, variables ? { variables } : undefined);
    const body = (await res.json()) as GraphqlResult<T>;
    if (body.errors) throw new ShopifyAdminError(`Shopify GraphQL error: ${JSON.stringify(body.errors)}`);
    if (!body.data) throw new ShopifyAdminError("Shopify GraphQL answered without data");
    return body.data;
  }

  private static check(result: UserErrors, what: string) {
    const errors = result?.userErrors ?? [];
    if (errors.length) throw new ShopifyAdminError(`${what}: ${errors.map((e) => e.message).join("; ")}`);
  }

  async getOrder(orderGid: string): Promise<ShopifyOrderState | null> {
    const data = await this.run<{
      order: {
        id: string;
        name: string;
        displayFinancialStatus: string | null;
        cancelledAt: string | null;
        note: string | null;
        totalOutstandingSet: { shopMoney: { amount: string; currencyCode: string } };
      } | null;
    }>(
      `#graphql
      query MezoutOrder($id: ID!) {
        order(id: $id) {
          id
          name
          displayFinancialStatus
          cancelledAt
          note
          totalOutstandingSet { shopMoney { amount currencyCode } }
        }
      }`,
      { id: orderGid },
    );
    const o = data.order;
    if (!o) return null;
    return {
      id: o.id,
      name: o.name,
      displayFinancialStatus: o.displayFinancialStatus,
      cancelledAt: o.cancelledAt,
      note: o.note,
      outstandingAmount: o.totalOutstandingSet.shopMoney.amount,
      outstandingCurrency: o.totalOutstandingSet.shopMoney.currencyCode,
    };
  }

  async markAsPaid(orderGid: string): Promise<string | null> {
    const data = await this.run<{
      orderMarkAsPaid: (UserErrors & { order?: { displayFinancialStatus: string | null } | null }) | null;
    }>(
      `#graphql
      mutation MezoutMarkAsPaid($input: OrderMarkAsPaidInput!) {
        orderMarkAsPaid(input: $input) {
          order { id displayFinancialStatus }
          userErrors { field message }
        }
      }`,
      { input: { id: orderGid } },
    );
    ShopifyAdmin.check(data.orderMarkAsPaid, "orderMarkAsPaid");
    return data.orderMarkAsPaid?.order?.displayFinancialStatus ?? null;
  }

  async addTags(gid: string, tags: string[]): Promise<void> {
    const data = await this.run<{ tagsAdd: UserErrors }>(
      `#graphql
      mutation MezoutTagsAdd($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
      }`,
      { id: gid, tags },
    );
    ShopifyAdmin.check(data.tagsAdd, "tagsAdd");
  }

  async removeTags(gid: string, tags: string[]): Promise<void> {
    const data = await this.run<{ tagsRemove: UserErrors }>(
      `#graphql
      mutation MezoutTagsRemove($id: ID!, $tags: [String!]!) {
        tagsRemove(id: $id, tags: $tags) { userErrors { field message } }
      }`,
      { id: gid, tags },
    );
    ShopifyAdmin.check(data.tagsRemove, "tagsRemove");
  }

  /**
   * Adds a line to the order's note (shown under "Notes" on the order page). Apps cannot write to the order timeline,
   * so the note is where the payment history goes, like WooCommerce's order notes.
   */
  async appendNote(orderGid: string, line: string, currentNote?: string | null): Promise<void> {
    let note = currentNote;
    if (note === undefined) {
      const data = await this.run<{ order: { note: string | null } | null }>(
        `#graphql
        query MezoutOrderNote($id: ID!) { order(id: $id) { note } }`,
        { id: orderGid },
      );
      note = data.order?.note ?? null;
    }
    const stamped = `[Mezout ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC] ${line}`;
    const next = note ? `${note}\n${stamped}` : stamped;
    const data = await this.run<{ orderUpdate: UserErrors }>(
      `#graphql
      mutation MezoutOrderNoteUpdate($input: OrderInput!) {
        orderUpdate(input: $input) { userErrors { field message } }
      }`,
      { input: { id: orderGid, note: next } },
    );
    ShopifyAdmin.check(data.orderUpdate, "orderUpdate");
  }

  /** Sets single-line text metafields in the "mezout" namespace on an order or the shop. */
  async setMetafields(ownerGid: string, values: Record<string, string>): Promise<void> {
    const metafields = Object.entries(values).map(([key, value]) => ({
      ownerId: ownerGid,
      namespace: METAFIELD_NAMESPACE,
      key,
      type: "single_line_text_field",
      value,
    }));
    if (!metafields.length) return;
    const data = await this.run<{ metafieldsSet: UserErrors }>(
      `#graphql
      mutation MezoutMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) { userErrors { field message } }
      }`,
      { metafields },
    );
    ShopifyAdmin.check(data.metafieldsSet, "metafieldsSet");
  }

  async getShop(): Promise<{ id: string; currencyCode: string }> {
    const data = await this.run<{ shop: { id: string; currencyCode: string } }>(
      `#graphql
      query MezoutShop { shop { id currencyCode } }`,
    );
    return data.shop;
  }
}
