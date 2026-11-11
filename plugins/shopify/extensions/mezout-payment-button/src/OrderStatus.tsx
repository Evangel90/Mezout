import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { PaymentButton } from "./PaymentButton";

// customer-account.order-status.block.render
export default async () => {
  render(<Extension />, document.body);
};

function metafield(type: string, key: string): string | undefined {
  const value = shopify.appMetafields.value.find(
    (entry) => entry.target.type === type && entry.metafield.namespace === "mezout" && entry.metafield.key === key,
  )?.metafield.value;
  return typeof value === "string" ? value : undefined;
}

function Extension() {
  return (
    <PaymentButton
      orderId={shopify.order.value?.id}
      surface="customer-account"
      appUrl={metafield("shop", "app_url")}
      getToken={() => shopify.sessionToken.get()}
      translate={(key, options) => String(shopify.i18n.translate(key, options))}
      fallback={{ checkoutUrl: metafield("order", "checkout_url"), status: metafield("order", "status") }}
    />
  );
}
