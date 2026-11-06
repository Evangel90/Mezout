import { cache } from "react";
import type { Metadata } from "next";
import { decodeSignedInvoice } from "@mezout/sdk";
import { Checkout } from "@/components/Checkout";
import { getDb } from "@/lib/server/db/client";
import { checkoutDetails } from "@/lib/server/profile";

type Params = { params: { token: string } };
type PageProps = Params & { searchParams: { embed?: string } };

// The merchant's business name and the order reference, looked up for display. A bad link or an unreachable database
// still renders the checkout, which validates the link itself.
const details = cache(async (token: string) => {
  try {
    const { invoice } = decodeSignedInvoice(token);
    return await checkoutDetails(getDb(), token, invoice.merchant);
  } catch {
    return { businessName: null, reference: null, successUrl: null, embedOrigins: [] as string[] };
  }
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { businessName } = await details(decodeURIComponent(params.token));
  return { title: businessName ? `Pay ${businessName}` : "Pay", robots: { index: false } };
}

export default async function PayPage({ params, searchParams }: PageProps) {
  const token = decodeURIComponent(params.token);
  const { businessName, reference, successUrl, embedOrigins } = await details(token);
  return (
    <Checkout
      token={token}
      businessName={businessName}
      reference={reference}
      successUrl={successUrl}
      embedded={searchParams.embed === "1"}
      embedOrigins={embedOrigins}
    />
  );
}
