"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { getAddress, isAddress, isAddressEqual, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useSignTypedData, useSwitchChain } from "wagmi";
import { mezoTestnet } from "@mezout/sdk";
import { Alert, Button, Field, buttonClass, cardClass, inputClass } from "@/components/ui";
import {
  createLocalPasskey,
  fetchRecoveryStatus,
  finishRecovery,
  loadLocalRecovery,
  recoveryRequest,
  saveLocalRecovery,
  signRecoveryWithPasskey,
  startRecovery,
  type LocalRecovery,
  type RecoveryStatus,
  type Wait,
} from "@/lib/recovery";

const when = (unix: number) => new Date(unix * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const friendly = (err: unknown) =>
  err instanceof Error && !/NotAllowedError|aborted|cancel|denied|rejected the request/i.test(err.name + err.message)
    ? err.message
    : "That didn’t go through. Try again.";
const sameKey = (a: Hex, b: Hex) => a.toLowerCase() === b.toLowerCase();

type StepFn = (label: string, fn: () => Promise<void>) => Promise<void>;

/**
 * Recovering a passkey account from a new device: create a passkey here, have the backup passkey or recovery wallet
 * approve it, wait out the delay (the old passkey can cancel), then finish and sign in with the new passkey.
 */
export function RecoverAccount() {
  const client = usePublicClient({ chainId: mezoTestnet.id });
  const wait: Wait = (hash) => client!.waitForTransactionReceipt({ hash, timeout: 90_000 });

  const [input, setInput] = useState("");
  const [account, setAccount] = useState<Address | null>(null);
  const [status, setStatus] = useState<RecoveryStatus | null>(null);
  const [local, setLocal] = useState<LocalRecovery | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [now, setNow] = useState(() => Date.now() / 1000);

  async function load(address: Address) {
    setError(null);
    setBusy("Checking…");
    try {
      setStatus(await fetchRecoveryStatus(address));
      setAccount(address);
    } catch (err) {
      setStatus(null);
      setError(friendly(err));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    const saved = loadLocalRecovery();
    if (saved) {
      setLocal(saved);
      setInput(saved.account);
      load(saved.account);
    }
    const t = setInterval(() => setNow(Date.now() / 1000), 30_000);
    return () => clearInterval(t);
    // Runs once on mount, to resume a recovery started on this device.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step: StepFn = async (label, fn) => {
    setError(null);
    setBusy(label);
    try {
      await fn();
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(null);
    }
  };

  const finish = (label: string) => (
    <Button
      className="w-full"
      loading={!!busy}
      onClick={() =>
        step("Finishing…", async () => {
          await finishRecovery(local!, status!, wait);
          setFinished(true);
        })
      }
    >
      {busy ?? label}
    </Button>
  );

  function body(account: Address, status: RecoveryStatus) {
    const mine = local && isAddressEqual(local.account, account) ? local : null;
    if (!status.supported) return <Alert>This account was created before recovery was available, so it can’t be recovered this way.</Alert>;
    if (mine && sameKey(status.owner, mine.publicKey)) return finish("Sign in with your new passkey");
    if (status.pending) {
      if (!mine || !sameKey(status.pending.publicKey, mine.publicKey)) {
        return <Alert tone="warning">A recovery for this account is already in progress on another device. It can finish after {when(status.pending.readyAt)}.</Alert>;
      }
      if (status.pending.readyAt > now) {
        return (
          <Alert tone="info" title="Recovery started">
            Come back on this device after {when(status.pending.readyAt)} to finish. Until then, the old passkey can still cancel it.
          </Alert>
        );
      }
      return (
        <>
          <p className="text-sm text-stone-700">The waiting period is over. Finish to sign in with your new passkey.</p>
          {finish("Finish recovery")}
        </>
      );
    }
    if (!status.signer) return <Alert>This account has no backup, so it can’t be recovered.</Alert>;
    return (
      <Start
        account={account}
        status={status}
        local={mine}
        busy={busy}
        step={step}
        wait={wait}
        onLocal={setLocal}
        onStarted={() => load(account)}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-10 sm:py-14">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-[-0.035em]">Recover your account</h1>
        <p className="text-stone-600">
          Lost your passkey? If you set up a backup, it can move your account to a new passkey on this device after the
          waiting period you chose.
        </p>
      </header>

      <form
        className={`${cardClass} space-y-4 p-6`}
        onSubmit={(e) => {
          e.preventDefault();
          if (isAddress(input)) load(getAddress(input));
        }}
      >
        <Field label="Account address" hint="Your Mezout payout address, starting with 0x.">
          {(ids) => (
            <input
              {...ids}
              required
              value={input}
              onChange={(e) => setInput(e.target.value.trim())}
              spellCheck={false}
              autoComplete="off"
              placeholder="0x…"
              className={`${inputClass} font-mono`}
            />
          )}
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" loading={busy === "Checking…"} disabled={!isAddress(input) || !!busy}>
            Continue
          </Button>
        </div>
      </form>

      {error && <Alert tone="danger">{error}</Alert>}

      {finished ? (
        <Alert
          tone="success"
          title="Account recovered"
          action={
            <Link href="/dashboard" className={buttonClass("primary", "sm")}>
              Go to dashboard
            </Link>
          }
        >
          Your new passkey owns the account now. Add a new backup on the Account page.
        </Alert>
      ) : (
        account && status && <section className={`${cardClass} space-y-4 p-6`}>{body(account, status)}</section>
      )}
    </div>
  );
}

function Start({
  account,
  status,
  local,
  busy,
  step,
  wait,
  onLocal,
  onStarted,
}: {
  account: Address;
  status: RecoveryStatus;
  local: LocalRecovery | null;
  busy: string | null;
  step: StepFn;
  wait: Wait;
  onLocal: (l: LocalRecovery) => void;
  onStarted: () => void;
}) {
  const { address: walletAddress, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();
  const signer = status.signer!;
  const days = Math.round(status.delay / 86_400);

  async function approve() {
    if (!local) return;
    let signature: Hex;
    if (signer.kind === "passkey") {
      signature = await signRecoveryWithPasskey(account, local.publicKey, status);
    } else {
      if (chainId !== mezoTestnet.id) await switchChainAsync({ chainId: mezoTestnet.id });
      signature = await signTypedDataAsync(recoveryRequest(account, local.publicKey, status));
    }
    await startRecovery(account, local.publicKey, signature, wait);
    onStarted();
  }

  return (
    <ol className="space-y-5">
      <li className="space-y-2">
        <p className="text-sm font-medium text-stone-900">1. Create a passkey on this device</p>
        {local ? (
          <p className="text-sm text-musd-700">Done. Your new passkey is ready.</p>
        ) : (
          <Button
            variant="secondary"
            loading={busy === "Creating your passkey…"}
            disabled={!!busy}
            onClick={() =>
              step("Creating your passkey…", async () => {
                const value = { account, ...(await createLocalPasskey("Mezout")) };
                saveLocalRecovery(value);
                onLocal(value);
              })
            }
          >
            Create passkey
          </Button>
        )}
      </li>
      <li className="space-y-2">
        <p className="text-sm font-medium text-stone-900">
          2. Approve with your {signer.kind === "passkey" ? "backup passkey" : "recovery wallet"}
        </p>
        <p className="text-sm text-stone-600">
          {signer.kind === "passkey"
            ? "Pick your backup passkey when the browser asks. It may be on another device."
            : `Connect the wallet ending in ${signer.address.slice(-4)} and sign. It’s free.`}{" "}
          The account moves to your new passkey after {days} days.
        </p>
        {signer.kind === "address" && !walletAddress ? (
          <Button variant="secondary" disabled={!local || !!busy} onClick={() => openConnectModal?.()}>
            Connect wallet
          </Button>
        ) : (
          <Button disabled={!local || !!busy} loading={busy === "Waiting for approval…"} onClick={() => step("Waiting for approval…", approve)}>
            Approve recovery
          </Button>
        )}
      </li>
    </ol>
  );
}
