import Link from "next/link";

const REPO = "https://github.com/Evangel90/Mezout";
const EXPLORER = "https://explorer.test.mezo.org/address";
const SOURCIFY = "https://repo.sourcify.dev/31611";

const features = [
  {
    title: "No wallet needed",
    body: "Sign up with a passkey: Face ID, Touch ID, Windows Hello or your phone. Payments land in your own ERC-4337 smart account, and withdrawals are gasless. Mezout never holds your funds or your key.",
  },
  {
    title: "Customers pay their way",
    body: "From their MUSD balance, or by borrowing MUSD against their BTC in the same transaction. Mezout pays the gas, and a borrow that would take a loan below 160% collateral is refused.",
  },
  {
    title: "Exact MUSD, every time",
    body: "You receive exactly the invoiced amount in one on-chain transaction. Share a payment link or QR code, or create invoices from your store with the API.",
  },
];

const steps = [
  "Create a payment link in the dashboard, or call POST /v1/invoices from your backend.",
  "Your customer opens the link, connects a Mezo wallet and picks Pay with MUSD or Borrow against my BTC.",
  "They approve in their wallet. Mezout's relayer submits the payment and pays the gas.",
  "The router sends you the MUSD and records the invoice as paid on Mezo.",
];

const contracts = [
  { name: "MezoutRouter", address: "0xAF79AB1cdB38c0C3944bB9440614B58871Ba6199" },
  { name: "MezoutAccountFactory", address: "0xeE85EE32488FF2D63eFe48159ddB59e6863cdF79" },
];

const curl = `curl https://usemezout.vercel.app/v1/invoices \\
  -H "Authorization: Bearer mzk_test_…" \\
  -H "Content-Type: application/json" \\
  -d '{"amount":"25.00","reference":"order-1001"}'`;

export default function Home() {
  return (
    <div className="space-y-14">
      <section className="space-y-5">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Get paid in MUSD. Let customers pay with Bitcoin.
        </h1>
        <p className="max-w-xl text-lg text-stone-600">
          A checkout for Mezo: customers pay from their MUSD balance or borrow against their BTC, and you receive the
          exact amount, without needing a wallet yourself.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard" className="rounded-lg bg-stone-900 px-4 py-2 text-white hover:bg-stone-700">
            Start accepting payments
          </Link>
          <a
            href={`${REPO}/blob/main/docs/API.md`}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 hover:bg-stone-100"
          >
            API docs
          </a>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="space-y-2 rounded-xl border border-stone-200 bg-white p-5">
            <h2 className="font-semibold">{f.title}</h2>
            <p className="text-sm text-stone-600">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">How a payment works</h2>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={s} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs text-white">
                {i + 1}
              </span>
              <span className="text-stone-700">{s}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">For developers</h2>
        <p className="text-stone-600">
          Get an API key in the dashboard, create invoices from your server and send customers to the returned{" "}
          <span className="font-mono text-sm">checkout_url</span>. Check status with{" "}
          <span className="font-mono text-sm">GET /v1/invoices/:id</span>.
        </p>
        <pre className="overflow-x-auto rounded-xl bg-stone-900 p-4 text-xs leading-relaxed text-stone-100">
          <code>{curl}</code>
        </pre>
      </section>

      <section className="space-y-3 border-t border-stone-200 pt-8 text-sm">
        <h2 className="font-semibold">Open and verifiable</h2>
        <p className="text-stone-600">
          Running on Mezo testnet with test funds only. Contract source is verified on Sourcify (exact match).
        </p>
        <ul className="space-y-1">
          {contracts.map((c) => (
            <li key={c.address} className="flex flex-wrap items-center gap-x-3">
              <span className="font-medium">{c.name}</span>
              <a href={`${EXPLORER}/${c.address}`} className="break-all font-mono text-xs text-blue-700 underline">
                {c.address}
              </a>
              <a href={`${SOURCIFY}/${c.address}`} className="text-xs text-stone-500 underline">
                source
              </a>
            </li>
          ))}
        </ul>
        <a href={REPO} className="inline-block text-stone-600 underline">
          Code on GitHub
        </a>
      </section>
    </div>
  );
}
