"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "@/lib/api";

type Endpoint = { id: string; url: string; secret?: string; created_at: string };
type Attempt = {
  event_id: string;
  event_type: string;
  attempt: number;
  status_code: number | null;
  error: string | null;
  response: string | null;
  duration_ms: number;
  at: string;
  delivery_status: "pending" | "succeeded" | "failed";
  next_attempt_at: string | null;
  delivery_id: string;
};

const DOCS = "/docs#webhooks";

/** Webhook endpoints, their signing secrets, test events and the delivery log. */
export function WebhooksPanel() {
  const [endpoints, setEndpoints] = useState<Endpoint[] | null>(null);
  const [url, setUrl] = useState("");
  const [created, setCreated] = useState<Endpoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setEndpoints((await api<{ data: Endpoint[] }>("/v1/webhook_endpoints")).data);
    } catch (err) {
      setError(errorText(err, "Could not load webhooks"));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const endpoint = await api<Endpoint>("/v1/webhook_endpoints", { body: { url } });
      setCreated(endpoint);
      setUrl("");
      await load();
    } catch (err) {
      setError(errorText(err, "Could not add the endpoint"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-6">
      <div className="max-w-2xl space-y-1">
        <h2 className="text-lg font-semibold">Webhooks</h2>
        <p className="text-sm text-stone-600">
          A webhook tells your store&apos;s server the moment something happens, such as a customer paying an invoice, so
          it can mark the order paid and fulfil it without anyone watching this dashboard. Add the URL your server
          listens on. Mezout sends each event as a signed POST and retries for 24 hours until your server answers 2xx.
{" "}
          <Link href={DOCS} className="underline">
            Webhooks guide
          </Link>
        </p>
      </div>

      {endpoints?.map((e) => <EndpointRow key={e.id} endpoint={e} onDeleted={load} />)}

      {created?.secret && (
        <div className="space-y-1 rounded-lg bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">Signing secret for {created.url}</p>
          <code className="block break-all font-mono text-xs">{created.secret}</code>
          <p className="text-xs text-amber-900">Store it on your server as the webhook secret.</p>
        </div>
      )}

      {endpoints && endpoints.length < 3 && (
        <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
          <input
            required
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-store.example/mezout/webhook"
            className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <button
            disabled={busy}
            className="rounded-lg bg-stone-900 px-4 py-2 text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add endpoint"}
          </button>
        </form>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}

function EndpointRow({ endpoint, onDeleted }: { endpoint: Endpoint; onDeleted: () => void }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadLog = useCallback(async () => {
    setAttempts((await api<{ attempts: Attempt[] }>(`/api/dashboard/webhooks/${endpoint.id}/attempts`)).attempts);
  }, [endpoint.id]);

  async function run(action: () => Promise<string | void>) {
    setBusy(true);
    setNote(null);
    try {
      const message = await action();
      if (message) setNote(message);
    } catch (err) {
      setNote(errorText(err, "That did not work"));
    } finally {
      setBusy(false);
    }
  }

  const test = () =>
    run(async () => {
      const r = await api<{ sent: number; succeeded: number }>(`/api/dashboard/webhooks/${endpoint.id}/test`, { body: {} });
      await loadLog();
      return r.succeeded > 0 ? "Test event delivered." : "Test event sent, but your server did not answer 2xx. See the log.";
    });

  const remove = () =>
    run(async () => {
      if (!confirm(`Stop sending webhooks to ${endpoint.url}?`)) return;
      await api(`/v1/webhook_endpoints/${endpoint.id}`, { method: "DELETE" });
      onDeleted();
    });

  const retry = (delivery: string) =>
    run(async () => {
      await api(`/api/dashboard/webhooks/${endpoint.id}/retry`, { body: { delivery } });
      await loadLog();
    });

  return (
    <div className="space-y-2 rounded-lg border border-stone-200 p-3">
      <p className="break-all font-mono text-sm">{endpoint.url}</p>
      <div className="flex flex-wrap gap-2 text-sm">
        <button disabled={busy} onClick={test} className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100 disabled:opacity-50">
          Send test event
        </button>
        <button
          disabled={busy}
          onClick={() => (attempts ? setAttempts(null) : run(loadLog))}
          className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100 disabled:opacity-50"
        >
          {attempts ? "Hide delivery log" : "Delivery log"}
        </button>
        <button
          disabled={busy}
          onClick={() =>
            secret
              ? setSecret(null)
              : run(async () => setSecret((await api<{ secret: string }>(`/api/dashboard/webhooks/${endpoint.id}/secret`)).secret))
          }
          className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100 disabled:opacity-50"
        >
          {secret ? "Hide secret" : "Show secret"}
        </button>
        <button disabled={busy} onClick={remove} className="rounded border border-red-200 px-3 py-1 text-red-800 hover:bg-red-50 disabled:opacity-50">
          Delete
        </button>
      </div>
      {secret && <code className="block break-all rounded bg-stone-100 px-2 py-1 font-mono text-xs">{secret}</code>}
      {note && <p className="text-sm text-stone-700">{note}</p>}
      {attempts &&
        (attempts.length === 0 ? (
          <p className="text-sm text-stone-500">No deliveries yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-xs">
            {attempts.map((a, i) => (
              <li key={`${a.delivery_id}:${a.attempt}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-1.5">
                <span className="font-mono">{a.event_type}</span>
                <span className={a.error ? "text-red-700" : "text-green-800"}>
                  {a.error ?? `HTTP ${a.status_code}`} · try {a.attempt} · {a.duration_ms} ms
                </span>
                <span className="text-stone-500">{new Date(a.at).toLocaleString()}</span>
                {a.response && (
                  <span className="w-full truncate font-mono text-stone-500" title={a.response}>
                    Response: {a.response}
                  </span>
                )}
                {a.delivery_status === "pending" && a.next_attempt_at && a.error && (
                  <span className="w-full text-stone-500">Next try {new Date(a.next_attempt_at).toLocaleString()}</span>
                )}
                {a.delivery_status === "failed" && attempts.findIndex((b) => b.delivery_id === a.delivery_id) === i && (
                  <button onClick={() => retry(a.delivery_id)} className="text-blue-800 underline">
                    Retry now
                  </button>
                )}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
