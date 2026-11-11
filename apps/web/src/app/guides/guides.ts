const REPO = "https://github.com/Evangel90/Mezout";

/** The guides at /guides/<slug>, in reading order. Each one's text is src/content/guides/<slug>.md. */
export const GUIDES = [
  {
    slug: "shopify",
    group: "Stores",
    title: "Shopify",
    summary: "Add a “Pay with Bitcoin or MUSD” option to your Shopify store.",
    source: "plugins/shopify",
  },
  {
    slug: "woocommerce",
    group: "Stores",
    title: "WooCommerce",
    summary: "Install the plugin and take payments at your WooCommerce checkout.",
    source: "plugins/woocommerce",
  },
  {
    slug: "embedded-checkout",
    group: "Your site",
    title: "Embedded checkout",
    summary: "Open checkout in a pop-up on your own site.",
    source: "packages/embed-react",
  },
  {
    slug: "ai-agents",
    group: "AI agents",
    title: "AI agents",
    summary: "Let agents pay you, run your account, or pay for you.",
    source: "packages/mcp",
  },
  {
    slug: "paywall",
    group: "AI agents",
    title: "Charge per request",
    summary: "Put a price on an API route. Agents pay, then get the answer.",
    source: "packages/paywall",
  },
] as const;

export type Guide = (typeof GUIDES)[number];

export const findGuide = (slug: string) => GUIDES.find((g) => g.slug === slug);

/** The guide's code on GitHub, for its explicit "View source on GitHub" link. */
export const sourceUrl = (g: Guide) => `${REPO}/tree/main/${g.source}`;
