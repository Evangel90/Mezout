"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import type { Address } from "viem";
import { LogoMark } from "@/components/site/Logo";
import { Alert, Button, CheckIcon, Field, KeyIcon, WalletIcon, inputClass } from "@/components/ui";
import { createPasskeyAccount, signInWithPasskey, type PasskeySession } from "@/lib/passkey";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

type Props = {
  /** A passkey account used on this device before; its server session has ended. */
  savedPasskey: PasskeySession | null;
  walletAddress: Address | null;
  busy: string | null;
  error: string | null;
  /** newName: the business name a new passkey account was created with. */
  onPasskeySession: (session: PasskeySession, newName?: string) => Promise<void>;
  onForgetPasskey: () => void;
  onWalletSignIn: () => Promise<void>;
  onWalletDisconnect: () => void;
  onError: (message: string | null) => void;
};

/** The signed-out dashboard: one choice between a passkey account and a wallet, each a separate merchant account. */
export function SignInChoice(props: Props) {
  const [chosen, setChosen] = useState<"passkey" | "wallet" | null>(null);
  const busyIn = (card: "passkey" | "wallet") => (chosen === card ? props.busy : null);

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-4 py-12 sm:py-16">
      <div className="space-y-4 text-center">
        <LogoMark className="mx-auto h-12 w-12 text-ink" />
        <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Sign in to Mezout</h1>
        <p className="mx-auto max-w-xl text-stone-600">
          Create a merchant account or sign back in. Each option below is a separate account with its own payout
          address, so use the same one every time.
        </p>
      </div>

      {props.error && <Alert tone="danger">{props.error}</Alert>}

      <div className="grid items-stretch gap-4 md:grid-cols-2">
        <PasskeyCard {...props} busy={busyIn("passkey")} onStart={() => setChosen("passkey")} />
        <WalletCard {...props} busy={busyIn("wallet")} onStart={() => setChosen("wallet")} />
      </div>

      <p className="text-center text-xs text-stone-500">
        Mezout runs on Mezo testnet. Signing in never costs gas and never gives Mezout access to your funds.
      </p>
    </div>
  );
}

function Card({
  icon,
  title,
  tag,
  recommended,
  intro,
  points,
  children,
}: {
  icon: ReactNode;
  title: string;
  tag: string;
  recommended?: boolean;
  intro: string;
  points: string[];
  children: ReactNode;
}) {
  return (
    <section
      className={`flex flex-col gap-5 rounded-2xl border bg-white p-6 shadow-card sm:p-7 ${recommended ? "border-ink ring-1 ring-ink" : "border-stone-200"}`}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${recommended ? "bg-ink text-white" : "border border-stone-200 bg-stone-50 text-stone-800"}`}>{icon}</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${recommended ? "bg-musd-50 text-musd-800 ring-1 ring-inset ring-musd-200" : "bg-stone-100 text-stone-700"}`}>
            {tag}
          </span>
        </div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-stone-600">{intro}</p>
        <ul className="space-y-1.5 text-sm text-stone-700">
          {points.map((p) => (
            <li key={p} className="flex gap-2">
              <CheckIcon className="mt-0.5 h-4 w-4 text-musd-600" />
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-auto space-y-3 border-t border-stone-100 pt-5">{children}</div>
    </section>
  );
}

const link = "text-sm font-medium text-stone-700 underline underline-offset-2 hover:text-stone-900 disabled:opacity-50";

function PasskeyCard({
  savedPasskey,
  busy,
  onStart,
  onPasskeySession,
  onForgetPasskey,
  onError,
}: Props & { onStart: () => void }) {
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported("PublicKeyCredential" in window), []);
  const [creating, setCreating] = useState(!savedPasskey);
  const [name, setName] = useState("");
  const [waiting, setWaiting] = useState<string | null>(null);
  const status = waiting ?? busy;

  async function run(label: string, get: () => Promise<PasskeySession>, newName?: string) {
    onStart();
    onError(null);
    setWaiting(label);
    let session: PasskeySession;
    try {
      session = await get();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      onError(/not registered/.test(message) ? message : "The passkey request was cancelled or failed. Please try again.");
      return;
    } finally {
      setWaiting(null);
    }
    await onPasskeySession(session, newName);
  }

  return (
    <Card
      icon={<KeyIcon />}
      title="Passkey account"
      tag="Recommended · no wallet"
      recommended
      intro="Mezout creates a payout account for you, secured by Face ID, Touch ID, Windows Hello or your phone."
      points={["Nothing to install or back up", "Gasless withdrawals, any time", "Only your passkey can move funds"]}
    >
      {!supported ? (
        <Alert tone="warning">This browser does not support passkeys. Use a Mezo wallet instead.</Alert>
      ) : savedPasskey && !creating ? (
        <>
          <Button size="lg" className="w-full" loading={!!status} onClick={() => run("Confirm with your passkey", async () => savedPasskey)}>
            {status ?? `Continue as ${short(savedPasskey.address)}`}
          </Button>
          <Button variant="secondary" className="w-full" disabled={!!status} onClick={() => run("Choose your passkey", signInWithPasskey)}>
            Use a different passkey
          </Button>
          <button
            disabled={!!status}
            onClick={() => {
              onForgetPasskey();
              setCreating(true);
            }}
            className={`${link} block w-full text-center`}
          >
            Create a new account instead
          </button>
        </>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run("Creating your passkey…", () => createPasskeyAccount(name.trim() || "Mezout merchant"), name);
            }}
            className="space-y-3"
          >
            <Field label="Business name" hint="Customers see it when they pay. You can change it later.">
              {(ids) => (
                <input
                  {...ids}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={64}
                  autoComplete="organization"
                  placeholder="Satoshi's Coffee Store"
                  className={inputClass}
                />
              )}
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={!!status}>
              {status ?? "Create account with passkey"}
            </Button>
          </form>
          <p className="text-center text-sm text-stone-600">
            Already have one?{" "}
            <button disabled={!!status} onClick={() => run("Choose your passkey", signInWithPasskey)} className={link}>
              Sign in with passkey
            </button>
          </p>
        </>
      )}
    </Card>
  );
}

function WalletCard({ walletAddress, busy, onStart, onWalletSignIn, onWalletDisconnect }: Props & { onStart: () => void }) {
  const { openConnectModal } = useConnectModal();
  return (
    <Card
      icon={<WalletIcon />}
      title="Mezo wallet"
      tag="Bring your own"
      intro="Get paid straight into a wallet you already use, such as MetaMask, or a Bitcoin wallet through Mezo Passport."
      points={["Payments land directly in your wallet", "You approve refunds in your wallet", "Your wallet pays gas for refunds"]}
    >
      {walletAddress ? (
        <>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              <span aria-hidden className="h-2 w-2 rounded-full bg-musd-500" />
              Connected <span className="font-mono">{short(walletAddress)}</span>
            </span>
            <button disabled={!!busy} onClick={onWalletDisconnect} className={link}>
              Disconnect
            </button>
          </div>
          <Button
            size="lg"
            className="w-full"
            loading={!!busy}
            onClick={() => {
              onStart();
              onWalletSignIn();
            }}
          >
            {busy ?? "Sign in with this wallet"}
          </Button>
          <p className="text-xs text-stone-500">You sign a message to prove you own the wallet. It costs no gas.</p>
        </>
      ) : (
        <>
          <Button variant="secondary" size="lg" className="w-full" onClick={() => openConnectModal?.()}>
            Connect wallet
          </Button>
          <p className="text-xs text-stone-500">Then sign one message to sign in. It costs no gas.</p>
        </>
      )}
    </Card>
  );
}
