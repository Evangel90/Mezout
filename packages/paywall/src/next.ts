import { createPaywall, type MezoutPayment, type PaywallOptions } from "./core";

/**
 * Wraps a Next.js App Router route handler (or any Fetch-API handler) in a Mezout 402 paywall.
 *
 *   export const GET = withMezout402({ apiKey: process.env.MEZOUT_API_KEY!, price: "0.05" },
 *     async (req, ctx, payment) => Response.json({ report, paidBy: payment.payer }));
 */
export function withMezout402<C = unknown>(
  opts: PaywallOptions,
  handler: (req: Request, ctx: C, payment: MezoutPayment) => Response | Promise<Response>,
) {
  const paywall = createPaywall(opts);
  return async (req: Request, ctx: C): Promise<Response> => {
    const outcome = await paywall.handle({ method: req.method, url: req.url, header: (name) => req.headers.get(name) });
    if (!outcome.paid) {
      return new Response(JSON.stringify(outcome.body), {
        status: outcome.status,
        headers: { "content-type": "application/json", "cache-control": "no-store", ...outcome.headers },
      });
    }
    const res = await handler(req, ctx, outcome.payment);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(outcome.headers)) headers.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}

export type { MezoutPayment, PaywallOptions } from "./core";
