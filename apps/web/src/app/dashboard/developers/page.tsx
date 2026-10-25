"use client";

import { ApiKeyPanel } from "@/components/ApiKeyPanel";
import { WebhooksPanel } from "@/components/WebhooksPanel";

export default function DevelopersPage() {
  return (
    <div className="space-y-6">
      <ApiKeyPanel />
      <WebhooksPanel />
    </div>
  );
}
