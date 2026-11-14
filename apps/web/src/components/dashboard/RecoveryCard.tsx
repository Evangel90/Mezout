"use client";

import { useCallback, useEffect, useState } from "react";
import { createPublicClient, getAddress, http, isAddress, type Hex } from "viem";
import { type RecoveryAction } from "@mezout/sdk";
import { network } from "@/lib/network";
import { Alert, Badge, Button, Card, CardHeader, Field, Skeleton, inputClass, useConfirm } from "@/components/ui";
import type { PasskeySession } from "@/lib/passkey";
import { changeRecovery, createLocalPasskey, DAY, DELAY_OPTIONS, fetchRecoveryStatus, shortKey, type RecoveryStatus } from "@/lib/recovery";

const client = createPublicClient({ chain: network.chain, transport: http() });
const wait = (hash: Hex) => client.waitForTransactionReceipt({ hash, timeout: 90_000 });
const days = (seconds: number) => `${Math.round(seconds / DAY)} days`;
const when = (unix: number) => new Date(unix * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * Account recovery for a passkey account: a backup passkey or a recovery wallet that can move the account to a new
 * passkey after a waiting period. The owner passkey approves every change, and can cancel a recovery before it ends.
 */
export function RecoveryCard({ session }: { session: PasskeySession }) {
  const [status, setStatus] = useState<RecoveryStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [method, setMethod] = useState<"passkey" | "address">("passkey");
  const [wallet, setWallet] = useState("");
  const [delay, setDelay] = useState(DELAY_OPTIONS[0].seconds);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const refresh = useCallback(
    () =>
      fetchRecoveryStatus(session.address)
        .then((s) => {
          setStatus(s);
          setLoadError(null);
        })
        .catch((err) => setLoadError(err instanceof Error ? err.message : "Couldn't load recovery settings")),
    [session.address],
  );
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function run(label: string, success: string, action: () => Promise<RecoveryAction>) {
    setBusy(label);
    setError(null);
    setDone(null);
    try {
      await changeRecovery(session, await action(), wait);
      setDone(success);
      setEditing(false);
      setWallet("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error && !/NotAllowedError|aborted|cancel/i.test(err.name + err.message) ? err.message : "That didn’t go through. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const walletError = wallet && !isAddress(wallet) ? "Enter a valid Mezo address starting with 0x" : null;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (method === "address") {
      if (!isAddress(wallet)) return;
      run("Confirm with your passkey…", "Recovery wallet saved.", async () => ({ type: "setAddress", address: getAddress(wallet), delay }));
    } else {
      run("Create the backup passkey…", "Backup passkey added.", async () => {
        const backup = await createLocalPasskey("Mezout backup");
        setBusy("Confirm with your passkey…");
        return { type: "setPasskey", publicKey: backup.publicKey, delay };
      });
    }
  }

  async function remove() {
    const ok = await confirm({
      title: "Remove recovery?",
      description: "If you lose your passkey after this, nobody can recover the account.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (ok) run("Confirm with your passkey…", "Recovery removed.", async () => ({ type: "remove" }));
  }

  const header = (
    <CardHeader
      title="Account recovery"
      description="If you lose this passkey, a backup can move the account to a new passkey after a waiting period. You can cancel it until then."
    />
  );

  if (loadError) {
    return (
      <Card className="space-y-4 p-6">
        {header}
        <Alert tone="danger" action={<Button variant="secondary" size="sm" onClick={refresh}>Retry</Button>}>
          {loadError}
        </Alert>
      </Card>
    );
  }
  if (!status) {
    return (
      <Card className="space-y-4 p-6">
        {header}
        <Skeleton className="h-16 w-full" />
      </Card>
    );
  }
  if (!status.supported) {
    return (
      <Card className="space-y-4 p-6">
        {header}
        <Alert>This account was created before recovery was available, so it can’t add a backup.</Alert>
      </Card>
    );
  }

  const showForm = !status.signer || editing;
  return (
    <Card className="space-y-5 p-6">
      {header}

      {status.pending && (
        <Alert
          tone="warning"
          title="Recovery in progress"
          action={
            <Button
              variant="danger"
              size="sm"
              loading={busy === "Cancelling…"}
              disabled={!!busy}
              onClick={() => run("Cancelling…", "Recovery cancelled.", async () => ({ type: "cancel" }))}
            >
              Cancel recovery
            </Button>
          }
        >
          A new passkey takes over this account on {when(status.pending.readyAt)}. If this wasn’t you, cancel it now and
          remove the backup.
        </Alert>
      )}

      {status.signer && !editing && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-stone-50 p-4">
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-2 text-sm font-medium text-stone-900">
              {status.signer.kind === "passkey" ? "Backup passkey" : "Recovery wallet"}
              <Badge tone="success">On</Badge>
            </p>
            <p className="break-all font-mono text-xs text-stone-600">
              {status.signer.kind === "passkey" ? shortKey(status.signer.publicKey) : status.signer.address}
            </p>
            <p className="text-xs text-stone-500">Waiting period: {days(status.delay)}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={!!busy} onClick={() => setEditing(true)}>
              Change
            </Button>
            <Button variant="danger-outline" size="sm" disabled={!!busy} onClick={remove}>
              Remove
            </Button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Recover with" hint={method === "passkey" ? "Save it on another device or a security key." : "A wallet only you control."}>
              {(ids) => (
                <select {...ids} value={method} onChange={(e) => setMethod(e.target.value as "passkey" | "address")} className={inputClass}>
                  <option value="passkey">Backup passkey</option>
                  <option value="address">Recovery wallet</option>
                </select>
              )}
            </Field>
            <Field label="Waiting period" hint="Time you have to cancel a recovery.">
              {(ids) => (
                <select {...ids} value={delay} onChange={(e) => setDelay(Number(e.target.value))} className={inputClass}>
                  {DELAY_OPTIONS.map((o) => (
                    <option key={o.seconds} value={o.seconds}>
                      {o.days} days
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          {method === "address" && (
            <Field label="Wallet address" error={walletError}>
              {(ids) => (
                <input
                  {...ids}
                  required
                  value={wallet}
                  onChange={(e) => setWallet(e.target.value.trim())}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="0x…"
                  className={`${inputClass} font-mono`}
                />
              )}
            </Field>
          )}
          <p className="text-xs text-stone-500">The backup can never move money. It can only start a recovery.</p>
          <div className="flex flex-wrap justify-end gap-2">
            {editing && (
              <Button variant="secondary" disabled={!!busy} onClick={() => setEditing(false)}>
                Keep current
              </Button>
            )}
            <Button type="submit" loading={!!busy && busy !== "Cancelling…"} disabled={!!busy || (method === "address" && !isAddress(wallet))}>
              {busy && busy !== "Cancelling…" ? busy : method === "passkey" ? "Add backup passkey" : "Save recovery wallet"}
            </Button>
          </div>
        </form>
      )}

      {error && <Alert tone="danger">{error}</Alert>}
      {done && <Alert tone="success">{done}</Alert>}
      {dialog}
    </Card>
  );
}
