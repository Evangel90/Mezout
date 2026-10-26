import Link from "next/link";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-24 text-center">
      <p className="text-sm font-medium text-stone-500">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">This page does not exist</h1>
      <p className="text-stone-600">
        If you followed a payment link, check that it was copied in full, or ask the merchant to send it again.
      </p>
      <div className="flex justify-center gap-3">
        <Link href="/" className="rounded-lg bg-stone-900 px-4 py-2 text-white hover:bg-stone-700">
          Go home
        </Link>
        <Link href="/docs" className="rounded-lg border border-stone-300 bg-white px-4 py-2 hover:bg-stone-100">
          API reference
        </Link>
      </div>
    </div>
  );
}
