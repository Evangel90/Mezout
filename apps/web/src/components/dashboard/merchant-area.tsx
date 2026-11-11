"use client";

import dynamic from "next/dynamic";
import { Loading } from "@/components/ui";

// MerchantGate uses Mezo Passport hooks, and Passport touches `document` on import, so it renders in the browser only.
// The dashboard pages themselves import no wallet code, so they can be built on the server.
export const MerchantArea = dynamic(() => import("./MerchantGate").then((m) => m.MerchantGate), {
  ssr: false,
  loading: () => <Loading label="Loading your dashboard…" />,
});
