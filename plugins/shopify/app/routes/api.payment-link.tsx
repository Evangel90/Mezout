import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { orderIdFrom, paymentLinkState, shopFromDest } from "../mezout/payment-link";
import { mezoutStore } from "../mezout/services.server";

/**
 * GET /api/payment-link?order=<order gid>&surface=checkout|customer-account
 *
 * Called by the checkout UI extension on the thank-you and order status pages, with Shopify's session token as the
 * bearer token. Answers whether the order has an unpaid Mezout invoice and, if so, its checkout link.
 */
async function handle(request: Request) {
  const url = new URL(request.url);
  const surface = url.searchParams.get("surface");
  // Both verify the session token Shopify gave the extension (signed with the app's secret) and answer CORS preflight.
  const { sessionToken, cors } =
    surface === "customer-account"
      ? await authenticate.public.customerAccount(request)
      : await authenticate.public.checkout(request);

  const shop = shopFromDest(sessionToken.dest);
  const orderId = orderIdFrom(url.searchParams.get("order"));
  if (!shop || !orderId) return cors(Response.json({ error: "Missing order" }, { status: 400 }));

  const state = await paymentLinkState(mezoutStore, shop, orderId);
  return cors(Response.json(state, { headers: { "Cache-Control": "no-store" } }));
}

export const loader = ({ request }: LoaderFunctionArgs) => handle(request);
export const action = ({ request }: ActionFunctionArgs) => handle(request);
