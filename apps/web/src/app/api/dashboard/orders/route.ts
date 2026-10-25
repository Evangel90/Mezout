import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/db/client";
import { listOrders, ordersCsv } from "@/lib/server/orders";
import { requireSession } from "@/lib/server/v1";

/** The order list; ?format=csv downloads it. */
export async function GET(req: Request) {
  const merchant = await requireSession(req);
  if (merchant instanceof NextResponse) return merchant;
  const csv = new URL(req.url).searchParams.get("format") === "csv";
  const orders = await listOrders(getDb(), merchant, csv ? 10_000 : 200);
  if (csv) {
    return new NextResponse(ordersCsv(orders), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="mezout-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      },
    });
  }
  return NextResponse.json({ orders }, { headers: { "cache-control": "no-store" } });
}
