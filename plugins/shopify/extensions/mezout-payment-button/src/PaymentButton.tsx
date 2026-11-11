import { useEffect, useState } from "preact/hooks";

/**
 * Shows "Complete payment" with the order's Mezout checkout link while it is unpaid. The link comes from the app
 * (GET /api/payment-link), authenticated with the session token Shopify gives this extension. Right after checkout
 * the app may still be creating the invoice, so the extension asks a few times before giving up.
 */

type LinkState =
  | { status: "loading" }
  | { status: "none" }
  | { status: "pending"; checkout_url: string; amount: string; expires_at: string }
  | { status: "paid" | "expired" | "review" };

export interface PaymentButtonProps {
  orderId: string | undefined;
  surface: "checkout" | "customer-account";
  appUrl: string | undefined;
  getToken: () => Promise<string>;
  translate: (key: string, options?: Record<string, string>) => string;
  /** Used when the app cannot be reached: the order's own metafields (order status page only). */
  fallback?: { checkoutUrl?: string; status?: string };
}

const ATTEMPTS = 10;
const RETRY_MS = 3000;

export function PaymentButton({ orderId, surface, appUrl, getToken, translate, fallback }: PaymentButtonProps) {
  const [state, setState] = useState<LinkState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load(attempt: number) {
      let next: LinkState | null = null;
      if (appUrl && orderId) {
        try {
          const token = await getToken();
          const res = await fetch(
            `${appUrl.replace(/\/+$/, "")}/api/payment-link?order=${encodeURIComponent(orderId)}&surface=${surface}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (res.ok) next = (await res.json()) as LinkState;
        } catch {
          next = null;
        }
      }
      if (cancelled) return;
      if (next && next.status !== "none") {
        setState(next);
        return;
      }
      if (attempt < ATTEMPTS && appUrl) {
        timer = setTimeout(() => load(attempt + 1), RETRY_MS);
        return;
      }
      if (fallback?.checkoutUrl && (fallback.status ?? "pending") === "pending") {
        setState({ status: "pending", checkout_url: fallback.checkoutUrl, amount: "", expires_at: "" });
      } else {
        setState({ status: "none" });
      }
    }

    load(1);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Load once per order; the callbacks are recreated on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUrl, orderId, surface]);

  if (state.status === "loading" || state.status === "none") return null;
  if (state.status === "paid") {
    return <s-banner tone="success" heading={translate("paidHeading")} />;
  }
  if (state.status === "expired") {
    return (
      <s-banner tone="warning" heading={translate("expiredHeading")}>
        <s-text>{translate("expiredBody")}</s-text>
      </s-banner>
    );
  }
  if (state.status === "review") {
    return (
      <s-banner tone="info" heading={translate("reviewHeading")}>
        <s-text>{translate("reviewBody")}</s-text>
      </s-banner>
    );
  }
  if (state.status !== "pending") return null;
  return (
    <s-banner tone="info" heading={translate("pendingHeading")}>
      <s-stack gap="base">
        <s-text>
          {state.amount ? translate("pendingBodyAmount", { amount: state.amount }) : translate("pendingBody")}
        </s-text>
        <s-button variant="primary" href={state.checkout_url} target="_blank">
          {translate("completePayment")}
        </s-button>
      </s-stack>
    </s-banner>
  );
}
