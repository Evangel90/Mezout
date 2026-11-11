"use client";

import Link from "next/link";
import { ApiKeyPanel } from "@/components/ApiKeyPanel";
import { EmbedOriginsForm } from "@/components/dashboard/EmbedOriginsForm";
import { ExternalIcon, PageHeader, buttonClass } from "@/components/ui";
import { WebhooksPanel } from "@/components/WebhooksPanel";

const REPO = "https://github.com/Evangel90/Mezout/tree/main/plugins";

const INTEGRATIONS = [
  { name: "REST API", body: "Create invoices from any backend.", href: "/docs#quickstart" },
  { name: "WooCommerce", body: "Plugin for classic and block checkouts.", href: `${REPO}/woocommerce` },
  { name: "Shopify", body: "App that adds a payment step to orders.", href: `${REPO}/shopify` },
  { name: "Embedded checkout", body: "Open checkout in a modal on your site.", href: "/docs#embedded-checkout" },
];

export default function DevelopersPage() {
  return (
    <>
      <PageHeader
        title="Developers"
        description="Connect your store: API keys for your server, webhooks for paid orders, and the sites allowed to embed checkout."
        action={
          <Link href="/docs" className={buttonClass("secondary", "sm")}>
            API reference
          </Link>
        }
      />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {INTEGRATIONS.map((i) => {
          const external = i.href.startsWith("http");
          return (
            <li key={i.name}>
              <a
                href={i.href}
                {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                className="group flex h-full flex-col gap-1 rounded-xl border border-stone-200 bg-white p-4 transition-colors hover:border-stone-300 hover:bg-stone-50"
              >
                <span className="flex items-center justify-between text-sm font-medium text-stone-900">
                  {i.name}
                  <ExternalIcon className="h-4 w-4 text-stone-400 group-hover:text-stone-700" />
                </span>
                <span className="text-xs text-stone-600">{i.body}</span>
              </a>
            </li>
          );
        })}
      </ul>
      <ApiKeyPanel />
      <WebhooksPanel />
      <EmbedOriginsForm />
    </>
  );
}
