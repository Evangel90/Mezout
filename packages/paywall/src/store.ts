/**
 * Remembers which paid invoices have already unlocked a request. `/v1/verify` is read-only (as x402's /verify must
 * be), so the merchant server enforces one request per invoice. `consume` must be atomic: true the first time only.
 */
export type ConsumedInvoices = { consume(invoiceId: string): Promise<boolean> };

/**
 * In-process store. Entries older than `ttlMs` (default 31 days, past the longest invoice lifetime) are dropped. Use a
 * shared store (Redis SETNX, a unique database row) when several server instances sit behind one URL.
 */
export function memoryStore(ttlMs = 31 * 24 * 60 * 60 * 1000): ConsumedInvoices {
  const seen = new Map<string, number>();
  return {
    async consume(id) {
      const now = Date.now();
      for (const [k, at] of seen) if (now - at > ttlMs) seen.delete(k);
      if (seen.has(id)) return false;
      seen.set(id, now);
      return true;
    },
  };
}
