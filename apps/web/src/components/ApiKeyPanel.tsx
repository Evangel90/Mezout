"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, CardHeader, CopyButton, EmptyState, KeyIcon, PlusIcon, Skeleton, useConfirm } from "@/components/ui";
import { api, errorText } from "@/lib/api";

type ApiKey = { id: string; prefix: string; created_at: string };

const MAX_KEYS = 5;

/** Creates, lists and revokes the signed-in merchant's API keys. The dashboard session already proves who they are. */
export function ApiKeyPanel() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

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
    const ok = await confirm({
      title: `Revoke ${k.prefix}…?`,
      description: "Requests using this key fail straight away. This can't be undone; create a new key if you still need one.",
      confirmLabel: "Revoke key",
      danger: true,
    });
    if (!ok) return;
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

  const full = keys !== null && keys.length >= MAX_KEYS;

  return (
    <Card className="space-y-5 p-6">
      <CardHeader
        title="API keys"
        description={
          <>
            Your store&apos;s server uses a key to create invoices and request refunds. Keep keys on the server, never in
            a browser or app. Invoices made with a key always pay this account.{" "}
            <Link href="/docs#authentication" className="font-medium text-stone-900 underline underline-offset-2">
              How keys work
            </Link>
          </>
        }
        action={
          <Button onClick={create} loading={busy === "create"} disabled={!!busy || full}>
            {busy !== "create" && <PlusIcon className="h-4 w-4" />}
            Create API key
          </Button>
        }
      />

      {created && (
        <Alert
          tone="warning"
          title="Copy this key now. It is shown once and can't be recovered."
          action={
            <Button variant="ghost" size="sm" onClick={() => setCreated(null)}>
              I saved it
            </Button>
          }
        >
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="block min-w-0 flex-1 break-all rounded-md border border-amber-200 bg-white px-3 py-2 font-mono text-xs text-stone-900">{created}</code>
            <CopyButton text={created} label="Copy key" />
          </div>
        </Alert>
      )}

      {keys === null ? (
        <div className="space-y-3" aria-hidden>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : keys.length === 0 ? (
        <EmptyState icon={<KeyIcon />} title="No API keys yet">
          Create one to connect your own backend, the WooCommerce plugin or the Shopify app.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-mono text-sm text-stone-900">{k.prefix}…</p>
                <p className="text-xs text-stone-500">Created {new Date(k.created_at).toLocaleString()}</p>
              </div>
              <Button variant="danger-outline" size="sm" onClick={() => revoke(k)} disabled={!!busy} loading={busy === k.id}>
                {busy === k.id ? "Revoking…" : "Revoke"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {full && <p className="text-xs text-stone-500">You have the maximum of {MAX_KEYS} keys. Revoke one to create another.</p>}
      {error && <Alert tone="danger">{error}</Alert>}
      {dialog}
    </Card>
  );
}
