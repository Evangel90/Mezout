import type { NextFunction, Request, Response } from "express";
import { createPaywall, type MezoutPayment, type PaywallOptions } from "./core";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by mezout402 once the request is paid. */
      mezout?: MezoutPayment;
    }
  }
}

/**
 * Express middleware: answers 402 with a Mezout payment request until the request carries proof of payment, then
 * calls the route with `req.mezout` set.
 *
 *   app.get("/report", mezout402({ apiKey, price: "0.05" }), (req, res) => res.json(report));
 *
 * Behind a proxy, enable `app.set("trust proxy", …)` so the resource URL uses the public host and protocol.
 */
export function mezout402(opts: PaywallOptions) {
  const paywall = createPaywall(opts);
  return async (req: Request, res: Response, next: NextFunction) => {
    const outcome = await paywall.handle({
      method: req.method,
      url: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
      header: (name) => req.get(name),
    });
    for (const [k, v] of Object.entries(outcome.headers)) res.setHeader(k, v);
    if (!outcome.paid) {
      res.status(outcome.status).json(outcome.body);
      return;
    }
    req.mezout = outcome.payment;
    next();
  };
}

export type { MezoutPayment, PaywallOptions } from "./core";
