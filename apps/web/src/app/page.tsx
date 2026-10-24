import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Get paid in MUSD. Let customers pay with Bitcoin.</h1>
      <p className="max-w-xl text-stone-600">
        Customers pay from their MUSD balance or borrow against their BTC on Mezo, in one transaction. You receive
        the exact invoiced amount. Mezout never holds your funds.
      </p>
      <Link href="/dashboard" className="inline-block rounded-lg bg-stone-900 px-4 py-2 text-white hover:bg-stone-700">
        Create a payment link
      </Link>
    </div>
  );
}
