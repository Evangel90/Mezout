import Link from "next/link";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="relative isolate overflow-hidden bg-canvas">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(40%_50%_at_50%_0%,rgba(255,107,20,0.12),transparent_70%)]" />
      <div className="mx-auto flex max-w-xl flex-col items-center space-y-6 px-4 py-28 text-center sm:py-36">
        <p className="font-mono text-sm font-medium tracking-widest text-signal-700">404</p>
        <h1 className="display-2">This page does not exist</h1>
        <p className="text-lg leading-relaxed text-stone-600">
          If you followed a payment link, check that it was copied in full, or ask the merchant to send it again.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/" className="pill-ink">
            Go home
          </Link>
          <Link href="/docs" className="pill-outline">
            API reference
          </Link>
        </div>
      </div>
    </div>
  );
}
