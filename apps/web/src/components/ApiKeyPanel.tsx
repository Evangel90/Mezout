"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "@/lib/api";

type ApiKey = { id: string; prefix: string; created_at: string };

const MAX_KEYS = 5;

/** Creates, lists and revokes the signed-in merchant's API keys. The dashboard session already proves who they are. */
export function ApiKeyPanel() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setKeys((await api<{ data: ApiKey[] }>("/api/keys")).data);
    } catch (err) {
      setError(errorText(err, "Could not load your keys"));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setBusy("create");
    setError(null);
    setCopied(false);
    try {
      setCreated((await api<{ key: string }>("/api/keys", { body: {} })).key);
      await load();
    } catch (err) {
      setError(errorText(err, "Could not create the key"));
    } finally {
      setBusy(null);
    }
  }

  async function revoke(k: ApiKey) {
    if (!window.confirm(`Revoke ${k.prefix}…? Requests using it will fail straight away. This cannot be undone.`)) return;
    setBusy(k.id);
    setError(null);
    try {
      await api(`/api/keys/${k.id}`, { method: "DELETE" });
      if (created?.startsWith(k.prefix)) setCreated(null);
      await load();
    } catch (err) {
      setError(errorText(err, "Could not revoke the key"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl space-y-1">
          <h2 className="text-lg font-semibold">API keys</h2>
          <p className="text-sm text-stone-600">
            Your store&apos;s server uses a key to create invoices and request refunds. Keep keys on the server, never in a
            browser or app. Every invoice made with a key pays this account&apos;s payout address.{" "}
            <Link href="/docs#authentication" className="underline">
              How keys work
            </Link>
          </p>
        </div>
        <button
          onClick={create}
          disabled={!!busy || (keys !== null && keys.length >= MAX_KEYS)}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {busy === "create" ? "Creating…" : "Create API key"}
        </button>
      </div>

      {created && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Copy this key now. It is shown once and cannot be recovered.</p>
          <code className="block break-all rounded bg-white px-3 py-2 font-mono text-xs">{created}</code>
          <div className="flex gap-3">
            <button
              onClick={() => {
                navigator.clipboard.writeText(created);
                setCopied(true);
              }}
              className="rounded border border-stone-300 bg-white px-3 py-1 text-sm hover:bg-stone-100"
            >
              {copied ? "Copied" : "Copy key"}
            </button>
            <button onClick={() => setCreated(null)} className="text-sm text-stone-600 underline">
              I saved it
            </button>
          </div>
        </div>
      )}

      {keys === null ? (
        <p className="text-sm text-stone-500">Loading keys…</p>
      ) : keys.length === 0 ? (
        <p className="rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-600">No API keys yet.</p>
      ) : (
        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <p className="font-mono text-sm">{k.prefix}…</p>
                <p className="text-xs text-stone-500">Created {new Date(k.created_at).toLocaleString()}</p>
              </div>
              <button
                onClick={() => revoke(k)}
                disabled={!!busy}
                className="rounded border border-stone-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {busy === k.id ? "Revoking…" : "Revoke"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {keys !== null && keys.length >= MAX_KEYS && (
        <p className="text-xs text-stone-500">You have the maximum of {MAX_KEYS} keys. Revoke one to create another.</p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
