import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { appUrl, clientFor, mezoutStore, syncShop } from "../mezout/services.server";
import { isConnected, mezoutWebhookUrl, publishAppUrl, saveSettings } from "../mezout/connect";
import { mezoutApiBase } from "../mezout/client";
import { DEFAULT_GATEWAY_NAME, isSupportedCurrency } from "../mezout/gateway";
import { ShopifyAdmin } from "../mezout/shopify-admin";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  // Opening the app re-registers the webhook endpoint if the app URL changed (a new `shopify app dev` tunnel).
  await syncShop(shop, admin.graphql);

  const settings = await mezoutStore.getShop(shop);
  let currency: string | null = null;
  try {
    currency = (await new ShopifyAdmin(admin.graphql).getShop()).currencyCode;
  } catch (e) {
    console.error("Mezout: could not read the shop currency", e);
  }
  const orders = await mezoutStore.listRecentOrders(shop, 10);
  const url = appUrl();

  return {
    shop,
    hasKey: Boolean(settings?.apiKey),
    keyHint: settings?.apiKey ? `${settings.apiKey.slice(0, 9)}…${settings.apiKey.slice(-4)}` : "",
    gatewayName: settings?.gatewayName || DEFAULT_GATEWAY_NAME,
    linkLifetimeHours: settings?.linkLifetimeHours ?? 24,
    connected: isConnected(settings, url),
    webhookEndpointId: settings?.webhookEndpointId ?? null,
    webhookUrl: url ? mezoutWebhookUrl(url, shop) : null,
    currency,
    currencyOk: currency === null || isSupportedCurrency(currency),
    dashboardUrl: `${mezoutApiBase()}/dashboard`,
    orders: orders.map((o) => ({
      orderName: o.orderName,
      orderId: o.orderId,
      invoiceId: o.invoiceId,
      amount: o.amount,
      status: o.status,
      checkoutUrl: o.checkoutUrl,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const result = await saveSettings({
    store: mezoutStore,
    shop: session.shop,
    appUrl: appUrl(),
    clientFor,
    apiKey: String(form.get("apiKey") ?? ""),
    gatewayName: String(form.get("gatewayName") ?? "") || DEFAULT_GATEWAY_NAME,
    linkLifetimeHours: Number(form.get("linkLifetimeHours") ?? 24),
  });
  try {
    await publishAppUrl({ store: mezoutStore, shop: session.shop, appUrl: appUrl(), admin: new ShopifyAdmin(admin.graphql) });
  } catch (e) {
    console.error("Mezout: could not publish the app URL", e);
  }
  return result.ok
    ? { ok: true as const, message: "Connected to Mezout. Webhooks are set up for this store." }
    : { ok: false as const, message: result.error };
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting payment",
  paid: "Paid",
  expired: "Link expired",
  mismatch: "Check amount",
};

export default function Settings() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const saving = useNavigation().state === "submitting";

  return (
    <s-page heading="Mezout">
      {result && (
        <s-banner tone={result.ok ? "success" : "critical"} heading={result.ok ? "Saved" : "Not connected"}>
          {result.message}
        </s-banner>
      )}
      {!data.currencyOk && (
        <s-banner tone="warning" heading="Store currency not supported">
          Your store currency is {data.currency}. Customers pay in MUSD at one MUSD per US dollar, so Mezout creates
          payment links only for orders in USD. Orders in other currencies get the tag mezout-unsupported-currency.
        </s-banner>
      )}

      <s-section heading="Connection">
        {data.connected ? (
          <s-paragraph>
            <s-badge tone="success">Connected</s-badge> Mezout sends payment events (endpoint {data.webhookEndpointId})
            to {data.webhookUrl}. Orders are marked paid when a signed payment event arrives with the right amount.
          </s-paragraph>
        ) : data.hasKey ? (
          <s-paragraph>
            <s-badge tone="critical">Not connected</s-badge> Webhooks are not set up, so orders cannot be marked paid.
            Save the settings to try again.
          </s-paragraph>
        ) : (
          <s-paragraph>
            Enter your Mezout API key to connect. Create one on the Developers tab of the{" "}
            <s-link href={data.dashboardUrl} target="_blank">
              Mezout dashboard
            </s-link>
            ; it starts with mzk_test_.
          </s-paragraph>
        )}

        <Form method="post">
          <s-stack gap="base">
            <s-password-field
              name="apiKey"
              label="Mezout API key"
              placeholder={data.hasKey ? `Saved (${data.keyHint}). Leave empty to keep it.` : "mzk_test_…"}
              autocomplete="off"
              details="Saving checks the key and registers this app's webhook endpoint with Mezout."
            />
            <s-text-field
              name="gatewayName"
              label="Payment method name"
              defaultValue={data.gatewayName}
              details="The exact name of the manual payment method you created in Settings → Payments. Any payment method whose name contains the word Mezout also counts."
            />
            <s-number-field
              name="linkLifetimeHours"
              label="Payment link lifetime (hours)"
              defaultValue={String(data.linkLifetimeHours)}
              min={1}
              max={720}
              details="How long the customer has to pay. After that the order is tagged mezout-unpaid; it is not cancelled."
            />
            <s-button type="submit" variant="primary" {...(saving ? { loading: true } : {})}>
              Save
            </s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Recent Mezout orders">
        {data.orders.length === 0 ? (
          <s-paragraph>No orders paid with Mezout yet.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Order</s-table-header>
              <s-table-header>Amount</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Invoice</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.orders.map((o) => (
                <s-table-row key={o.orderId}>
                  <s-table-cell>
                    <s-link href={`shopify://admin/orders/${o.orderId}`} target="_top">
                      {o.orderName}
                    </s-link>
                  </s-table-cell>
                  <s-table-cell>{o.amount} MUSD</s-table-cell>
                  <s-table-cell>{STATUS_LABEL[o.status] ?? o.status}</s-table-cell>
                  <s-table-cell>
                    <s-link href={o.checkoutUrl} target="_blank">
                      {o.invoiceId}
                    </s-link>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section slot="aside" heading="Set up">
        <s-ordered-list>
          <s-list-item>
            In Settings → Payments → Manual payment methods, add a custom method named &quot;{data.gatewayName}&quot;.
          </s-list-item>
          <s-list-item>Enter your Mezout API key here and save.</s-list-item>
          <s-list-item>
            In Settings → Checkout → Customize, add the &quot;Mezout payment button&quot; block to the Thank you and
            Order status pages.
          </s-list-item>
          <s-list-item>Place a test order with that payment method and pay it on Mezo testnet.</s-list-item>
        </s-ordered-list>
      </s-section>
      <s-section slot="aside" heading="How payment works">
        <s-paragraph>
          The order is created as Payment pending. Mezout creates an invoice for the order total in MUSD and the
          customer pays it from the Complete payment button. When Mezout confirms the payment on Mezo, the app marks
          the order paid. A signed Mezout webhook is the only thing that marks an order paid.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
