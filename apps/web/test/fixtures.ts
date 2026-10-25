import { randomBytes } from "node:crypto";
import { encodeSignedInvoice } from "@mezout/sdk";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Merchant } from "@/lib/server/apiKeys";
import type { Db } from "@/lib/server/db/client";
import { merchants, webhookEndpoints } from "@/lib/server/db/schema";
import { createInvoice } from "@/lib/server/invoices";
import { ROUTER_V2 } from "./chain";

export const ORIGIN = "https://mezout.test";
export const PLATFORM_SECRET = "test-platform-secret";

export async function makeMerchant(db: Db): Promise<Merchant> {
  const address = privateKeyToAccount(generatePrivateKey()).address;
  const [m] = await db.insert(merchants).values({ payoutAddress: address }).returning();
  return m;
}

/** A stored invoice signed (with a dummy signature) for router v2 unless another is given. */
export function makeInvoice(
  db: Db,
  merchant: Merchant,
  opts: { amount?: string; expiresIn?: number; now?: number; router?: `0x${string}`; reference?: string } = {},
) {
  const sign = async (invoice: Parameters<typeof encodeSignedInvoice>[0]["invoice"]) =>
    encodeSignedInvoice({ invoice, signature: "0x01", router: opts.router ?? ROUTER_V2 });
  return createInvoice(
    db,
    merchant,
    { amount: opts.amount ?? "10", expiresIn: opts.expiresIn ?? 3600, reference: opts.reference },
    sign,
    opts.now,
  );
}

export async function makeEndpoint(db: Db, merchant: Merchant, url = "https://shop.example/hook") {
  const [e] = await db
    .insert(webhookEndpoints)
    .values({ id: `we_${randomBytes(12).toString("hex")}`, merchantId: merchant.id, url })
    .returning();
  return e;
}
