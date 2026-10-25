"use client";

import dynamic from "next/dynamic";

// The dashboard uses Mezo Passport hooks, and Passport touches `document` on import, so it renders in the browser only.
const Dashboard = dynamic(() => import("@/components/Dashboard").then((m) => m.Dashboard), { ssr: false });

export default function DashboardPage() {
  return <Dashboard />;
}
