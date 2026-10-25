import "server-only";
import { lookup } from "node:dns";
import { BlockList, isIP } from "node:net";
import { Agent, fetch } from "undici";
import type { Sender } from "./webhooks";

// Merchant-supplied URLs are fetched from Mezout's servers, so they must not reach private networks or cloud
// metadata services. The check runs on the address the connection actually uses, which also defeats DNS rebinding.
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

export function isPrivateAddress(address: string): boolean {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return blocked.check(mapped[1], "ipv4");
  const family = isIP(address);
  if (family === 4) return blocked.check(address, "ipv4");
  if (family === 6) return blocked.check(address, "ipv6");
  return true;
}

export class WebhookUrlError extends Error {}

/**
 * Validates a webhook endpoint URL. Production accepts only public https URLs; development also accepts http and
 * private hosts so a local store (for example WordPress on localhost) can receive events.
 */
export function checkEndpointUrl(raw: string, allowPrivate: boolean): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebhookUrlError("url must be an absolute URL");
  }
  if (raw.length > 500) throw new WebhookUrlError("url is too long");
  if (url.username || url.password) throw new WebhookUrlError("url must not contain credentials");
  if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) {
    throw new WebhookUrlError("url must use https");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!allowPrivate && (host === "localhost" || host.endsWith(".localhost") || (isIP(host) && isPrivateAddress(host)))) {
    throw new WebhookUrlError("url must be reachable on the public internet");
  }
  return url.toString();
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | { address: string; family: number }[], family?: number) => void;

function guardedLookup(allowPrivate: boolean) {
  return (hostname: string, options: { all?: boolean }, callback: LookupCallback) => {
    lookup(hostname, { all: true }, (err, addresses) => {
      if (err) return callback(err, []);
      const usable = allowPrivate ? addresses : addresses.filter((a) => !isPrivateAddress(a.address));
      if (usable.length === 0) {
        return callback(Object.assign(new Error(`${hostname} resolves to a private address`), { code: "EPRIVATE" }), []);
      }
      if (options.all) return callback(null, usable);
      callback(null, usable[0].address, usable[0].family);
    });
  };
}

const TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 4096;

/** Posts a webhook: 10-second timeout, no redirects, and only the first 4 KB of the response is read. */
export function webhookSender(allowPrivate = false): Sender {
  const dispatcher = new Agent({ connect: { lookup: guardedLookup(allowPrivate) as never, timeout: TIMEOUT_MS } });
  return async (url, body, headers) => {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    if (!allowPrivate && isIP(host) && isPrivateAddress(host)) throw new Error("url points at a private address");
    const res = await fetch(url, {
      method: "POST",
      body,
      headers,
      redirect: "manual",
      dispatcher,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let text = "";
    if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let bytes = 0;
      while (bytes < MAX_RESPONSE_BYTES) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        text += decoder.decode(value, { stream: true });
      }
      await reader.cancel().catch(() => {});
    }
    if (res.status >= 300 && res.status < 400) return { statusCode: res.status, body: "Redirects are not followed" };
    return { statusCode: res.status, body: text };
  };
}

/** Private hosts are allowed outside production, so webhooks can reach a local store. */
export const allowPrivateWebhooks = () => process.env.NODE_ENV !== "production";
