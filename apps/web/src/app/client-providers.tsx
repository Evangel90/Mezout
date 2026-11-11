"use client";

import dynamic from "next/dynamic";
import { Loading } from "@/components/ui";

// Mezo Passport touches `document` on import, so the wallet stack renders in the browser only.
export const ClientProviders = dynamic(() => import("./providers").then((m) => m.Providers), {
  ssr: false,
  loading: () => <Loading />,
});
