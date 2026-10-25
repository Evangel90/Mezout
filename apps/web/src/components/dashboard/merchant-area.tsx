"use client";

import dynamic from "next/dynamic";

// MerchantGate uses Mezo Passport hooks, and Passport touches `document` on import, so it renders in the browser only.
// The dashboard pages themselves import no wallet code, so they can be built on the server.
export const MerchantArea = dynamic(() => import("./MerchantGate").then((m) => m.MerchantGate), {
  ssr: false,
  loading: () => <p className="text-sm text-stone-500">Loading…</p>,
});
