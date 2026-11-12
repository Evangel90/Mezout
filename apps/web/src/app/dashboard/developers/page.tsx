"use client";

import { ApiKeyPanel } from "@/components/ApiKeyPanel";
import { EmbedOriginsForm } from "@/components/dashboard/EmbedOriginsForm";
import { ExternalIcon, ExternalLink, PageHeader, buttonClass } from "@/components/ui";
import { WebhooksPanel } from "@/components/WebhooksPanel";

/** Setup guides on the main site. They open in a new tab so the merchant can follow along with this page open. */
const INTEGRATIONS = [
  { name: "Shopify", body: "Add a “Pay with Bitcoin or MUSD” option.", href: "/guides/shopify" },
  { name: "WooCommerce", body: "Install the plugin. Paste your key.", href: "/guides/woocommerce" },
  { name: "Your own site", body: "Open checkout in a pop-up.", href: "/guides/embedded-checkout" },
  { name: "AI agents", body: "Get paid by agents, per request.", href: "/guides/ai-agents" },
];

export default function DevelopersPage() {
  return (
    <>
      <PageHeader
        title="Developers"
        description="Connect your store. Create an API key, then follow the guide for your platform."
        action={
          <ExternalLink href="/docs" className={buttonClass("secondary", "sm")} iconClassName="h-4 w-4">
            API reference
          </ExternalLink>
        }
      />
      <section aria-labelledby="guides-title" className="space-y-3">
        <h2 id="guides-title" className="text-sm font-medium text-stone-600">
          Setup guides
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {INTEGRATIONS.map((i) => (
            <li key={i.name}>
              <ExternalLink
                href={i.href}
                icon={false}
                className="group flex h-full flex-col gap-1 rounded-xl border border-stone-200 bg-white p-4 transition-colors hover:border-stone-300 hover:bg-stone-50"
              >
                <span className="flex items-center justify-between text-sm font-medium text-stone-900">
                  {i.name}
                  <ExternalIcon className="h-4 w-4 text-stone-400 group-hover:text-stone-700" />
                </span>
                <span className="text-[13px] text-stone-600">{i.body}</span>
              </ExternalLink>
            </li>
          ))}
        </ul>
      </section>
      <ApiKeyPanel />
      <WebhooksPanel />
      <EmbedOriginsForm />
    </>
  );
}
