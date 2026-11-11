"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, CopyButton, EmptyState, Field, Skeleton, WebhookIcon, inputClass, useConfirm } from "@/components/ui";
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
const MAX_ENDPOINTS = 3;

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
    <Card className="space-y-5 p-6">
      <CardHeader
        title="Webhooks"
        description={
          <>
            Mezout calls your server the moment a customer pays, a link expires or a refund completes, so your store can
            fulfil orders on its own. Each event is a signed POST, retried for 24 hours until your server answers 2xx.{" "}
            <Link href={DOCS} className="font-medium text-stone-900 underline underline-offset-2">
              Webhooks guide
            </Link>
          </>
        }
      />

      {created?.secret && (
        <Alert
          tone="warning"
          title="Endpoint added. Store this signing secret on your server."
          action={
            <Button variant="ghost" size="sm" onClick={() => setCreated(null)}>
              Done
            </Button>
          }
        >
          <p className="break-all text-xs">{created.url}</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="block min-w-0 flex-1 break-all rounded-md border border-amber-200 bg-white px-3 py-2 font-mono text-xs text-stone-900">{created.secret}</code>
            <CopyButton text={created.secret} label="Copy secret" />
          </div>
        </Alert>
      )}

      {endpoints === null ? (
        <Skeleton className="h-20 w-full" />
      ) : endpoints.length === 0 ? (
        <EmptyState icon={<WebhookIcon />} title="No endpoints yet">
          Add the URL your server listens on. The WooCommerce plugin and Shopify app add theirs automatically.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {endpoints.map((e) => (
            <EndpointRow key={e.id} endpoint={e} onDeleted={load} />
          ))}
        </ul>
      )}

      {endpoints && endpoints.length < MAX_ENDPOINTS && (
        <form onSubmit={add} className="space-y-2 border-t border-stone-100 pt-5">
          <Field label="Add an endpoint" hint={`A public https URL. Up to ${MAX_ENDPOINTS} endpoints per account.`}>
            {(ids) => (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  {...ids}
                  required
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://your-store.example/webhooks/mezout"
                  className={`${inputClass} sm:flex-1`}
                />
                <Button type="submit" loading={busy}>
                  {busy ? "Adding…" : "Add endpoint"}
                </Button>
              </div>
            )}
          </Field>
        </form>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
    </Card>
  );
}

function EndpointRow({ endpoint, onDeleted }: { endpoint: Endpoint; onDeleted: () => void }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [note, setNote] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const loadLog = useCallback(async () => {
    setAttempts((await api<{ attempts: Attempt[] }>(`/api/dashboard/webhooks/${endpoint.id}/attempts`)).attempts);
  }, [endpoint.id]);

  async function run(label: string, action: () => Promise<{ tone: "success" | "warning"; text: string } | void>) {
    setBusy(label);
    setNote(null);
    try {
      const message = await action();
      if (message) setNote(message);
    } catch (err) {
      setNote({ tone: "danger", text: errorText(err, "That did not work") });
    } finally {
      setBusy(null);
    }
  }

  const test = () =>
    run("test", async () => {
      const r = await api<{ sent: number; succeeded: number }>(`/api/dashboard/webhooks/${endpoint.id}/test`, { body: {} });
      await loadLog();
      return r.succeeded > 0
        ? { tone: "success", text: "Test event delivered." }
        : { tone: "warning", text: "Test event sent, but your server did not answer 2xx. See the delivery log." };
    });

  async function remove() {
    const ok = await confirm({
      title: "Delete this endpoint?",
      description: (
        <>
          Mezout stops sending webhooks to <span className="break-all font-mono text-stone-900">{endpoint.url}</span> straight away, and
          deliveries still queued for it are marked failed.
        </>
      ),
      confirmLabel: "Delete endpoint",
      danger: true,
    });
    if (!ok) return;
    run("delete", async () => {
      await api(`/v1/webhook_endpoints/${endpoint.id}`, { method: "DELETE" });
      onDeleted();
    });
  }

  const retry = (delivery: string) =>
    run("retry", async () => {
      await api(`/api/dashboard/webhooks/${endpoint.id}/retry`, { body: { delivery } });
      await loadLog();
    });

  return (
    <li className="space-y-3 rounded-lg border border-stone-200 p-4">
      <div className="space-y-1">
        <p className="break-all font-mono text-sm text-stone-900">{endpoint.url}</p>
        <p className="text-xs text-stone-500">Added {new Date(endpoint.created_at).toLocaleDateString()}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={!!busy} loading={busy === "test"} onClick={test}>
          Send test event
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!!busy}
          loading={busy === "log"}
          aria-expanded={!!attempts}
          onClick={() => (attempts ? setAttempts(null) : run("log", loadLog))}
        >
          {attempts ? "Hide delivery log" : "Delivery log"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!!busy}
          loading={busy === "secret"}
          aria-expanded={!!secret}
          onClick={() =>
            secret
              ? setSecret(null)
              : run("secret", async () => setSecret((await api<{ secret: string }>(`/api/dashboard/webhooks/${endpoint.id}/secret`)).secret))
          }
        >
          {secret ? "Hide secret" : "Show secret"}
        </Button>
        <Button variant="danger-outline" size="sm" disabled={!!busy} loading={busy === "delete"} onClick={remove}>
          Delete
        </Button>
      </div>
      {secret && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="block min-w-0 flex-1 break-all rounded-md bg-stone-100 px-3 py-2 font-mono text-xs">{secret}</code>
          <CopyButton text={secret} label="Copy secret" />
        </div>
      )}
      {note && <Alert tone={note.tone}>{note.text}</Alert>}
      {attempts &&
        (attempts.length === 0 ? (
          <p className="rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-500">No deliveries yet. Send a test event to try your endpoint.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <caption className="sr-only">Delivery attempts for {endpoint.url}</caption>
              <thead className="bg-stone-50 text-stone-500">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Event</th>
                  <th scope="col" className="px-3 py-2 font-medium">Result</th>
                  <th scope="col" className="px-3 py-2 font-medium">Try</th>
                  <th scope="col" className="px-3 py-2 font-medium">Time</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {attempts.map((a, i) => (
                  <tr key={`${a.delivery_id}:${a.attempt}`} className="align-top">
                    <td className="px-3 py-2 font-mono text-stone-900">{a.event_type}</td>
                    <td className="px-3 py-2">
                      <Badge tone={a.error ? "danger" : "success"}>{a.error ?? `HTTP ${a.status_code}`}</Badge>
                      <span className="ml-2 text-stone-500">{a.duration_ms} ms</span>
                      {a.response && (
                        <span className="mt-1 block max-w-[18rem] truncate font-mono text-stone-500" title={a.response}>
                          {a.response}
                        </span>
                      )}
                      {a.delivery_status === "pending" && a.next_attempt_at && a.error && (
                        <span className="mt-1 block text-stone-500">Next try {new Date(a.next_attempt_at).toLocaleString()}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-stone-600">{a.attempt}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-stone-600">{new Date(a.at).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      {a.delivery_status === "failed" && attempts.findIndex((b) => b.delivery_id === a.delivery_id) === i && (
                        <Button variant="secondary" size="sm" disabled={!!busy} onClick={() => retry(a.delivery_id)}>
                          Retry now
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      {dialog}
    </li>
  );
}
