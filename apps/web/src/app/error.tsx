"use client";

/** Shown when a page fails to render. Nothing about the error is displayed beyond Next's digest for support. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-stone-600">The page could not load. Your funds are not affected. Please try again.</p>
      <button onClick={reset} className="rounded-lg bg-stone-900 px-4 py-2 text-white hover:bg-stone-700">
        Try again
      </button>
      {error.digest && <p className="font-mono text-xs text-stone-400">Reference {error.digest}</p>}
    </div>
  );
}
