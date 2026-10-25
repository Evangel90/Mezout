/** JSON fetch for Mezout's own routes; throws the server's error message. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error ?? `Request failed (${res.status})`), { status: res.status });
  return json as T;
}

export const errorText = (err: unknown, fallback: string) => {
  const message = err instanceof Error ? err.message : fallback;
  // Wallet rejections are long; keep the first line.
  return message.split("\n")[0] || fallback;
};
