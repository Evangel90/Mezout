import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { PaymentButton } from "./PaymentButton";

// purchase.thank-you.block.render
export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const appUrl = shopify.appMetafields.value.find(
    (entry) =>
      entry.target.type === "shop" && entry.metafield.namespace === "mezout" && entry.metafield.key === "app_url",
  )?.metafield.value;

  return (
    <PaymentButton
      orderId={shopify.orderConfirmation.value?.order?.id}
      surface="checkout"
      appUrl={typeof appUrl === "string" ? appUrl : undefined}
      getToken={() => shopify.sessionToken.get()}
      translate={(key, options) => String(shopify.i18n.translate(key, options))}
    />
  );
}
