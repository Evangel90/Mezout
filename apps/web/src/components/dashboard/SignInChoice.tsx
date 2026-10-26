"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import type { Address } from "viem";
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
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to your merchant dashboard</h1>
        <p className="max-w-2xl text-stone-600">
          Choose <span className="font-medium text-stone-900">one</span> way to get paid. Each option is a separate
          merchant account with its own payout address, so use the same one every time you sign in.
        </p>
      </div>

      <div className="grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr]">
        <PasskeyCard {...props} busy={busyIn("passkey")} onStart={() => setChosen("passkey")} />
        <Or />
        <WalletCard {...props} busy={busyIn("wallet")} onStart={() => setChosen("wallet")} />
      </div>

      {props.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {props.error}
        </p>
      )}
    </div>
  );
}

function Or() {
  return (
    <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-stone-400 md:flex-col">
      <span className="h-px flex-1 bg-stone-200 md:h-auto md:w-px" />
      or
      <span className="h-px flex-1 bg-stone-200 md:h-auto md:w-px" />
    </div>
  );
}

function Card({
  icon,
  title,
  tag,
  intro,
  points,
  children,
}: {
  icon: ReactNode;
  title: string;
  tag: string;
  intro: string;
  points: string[];
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-900 text-white">{icon}</span>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">{tag}</span>
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-stone-600">{intro}</p>
        <ul className="space-y-1.5 text-sm text-stone-700">
          {points.map((p) => (
            <li key={p} className="flex gap-2">
              <span aria-hidden className="text-green-700">✓</span>
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-auto space-y-3 border-t border-stone-100 pt-5">{children}</div>
    </section>
  );
}

const primary = "w-full rounded-lg bg-stone-900 px-4 py-2.5 font-medium text-white hover:bg-stone-700 disabled:opacity-50";
const secondary = "w-full rounded-lg border border-stone-300 px-4 py-2.5 hover:bg-stone-50 disabled:opacity-50";
const link = "text-sm text-stone-600 underline hover:text-stone-900 disabled:opacity-50";

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
      tag="No wallet needed"
      intro="Mezout creates a payout account for you, secured by Face ID, Touch ID, Windows Hello or your phone."
      points={["Nothing to install or back up", "Withdraw any time, Mezout pays the gas", "Mezout never holds your funds or your key"]}
    >
      {!supported ? (
        <p className="text-sm text-amber-800">This browser does not support passkeys. Use a wallet instead.</p>
      ) : savedPasskey && !creating ? (
        <>
          <button disabled={!!status} onClick={() => run("Confirm with your passkey", async () => savedPasskey)} className={primary}>
            {status ?? `Continue as ${short(savedPasskey.address)}`}
          </button>
          <button disabled={!!status} onClick={() => run("Choose your passkey", signInWithPasskey)} className={secondary}>
            Use a different passkey
          </button>
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
            <label className="block space-y-1">
              <span className="text-sm font-medium">Business name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={64}
                placeholder="Satoshi's Coffee Store"
                className="w-full rounded-lg border border-stone-300 px-3 py-2"
              />
              <span className="block text-xs text-stone-500">Customers see it when they pay. You can change it later.</span>
            </label>
            <button disabled={!!status} className={primary}>
              {status ?? "Create account with passkey"}
            </button>
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
      intro="Get paid straight into a wallet you already use, such as MetaMask or a Bitcoin wallet through Mezo Passport."
      points={["Payments land directly in your wallet", "You sign refunds in your wallet", "Your wallet pays its own gas for refunds"]}
    >
      {walletAddress ? (
        <>
          <p className="flex items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 text-sm">
            <span>
              Connected <span className="font-mono">{short(walletAddress)}</span>
            </span>
            <button disabled={!!busy} onClick={onWalletDisconnect} className={link}>
              Disconnect
            </button>
          </p>
          <button
            disabled={!!busy}
            onClick={() => {
              onStart();
              onWalletSignIn();
            }}
            className={primary}
          >
            {busy ?? "Sign in with this wallet"}
          </button>
          <p className="text-xs text-stone-500">Signing a message proves you own the wallet. It costs no gas.</p>
        </>
      ) : (
        <>
          <button onClick={() => openConnectModal?.()} className={primary}>
            Connect wallet
          </button>
          <p className="text-xs text-stone-500">Then sign one message to sign in. It costs no gas.</p>
        </>
      )}
    </Card>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.8 12.2 20 3m-4 4 3 3m-5-1 2 2" strokeLinecap="round" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden>
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="M3 10h18M16 15h2M6 6l9-3 1 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
