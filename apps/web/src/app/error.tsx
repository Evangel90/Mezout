"use client";

/** Shown when a page fails to render. Nothing about the error is displayed beyond Next's digest for support. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="bg-canvas">
      <div className="mx-auto flex max-w-xl flex-col items-center space-y-6 px-4 py-28 text-center sm:py-36">
        <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-2xl border border-stone-200 bg-white text-xl font-semibold shadow-card">
          !
        </span>
        <h1 className="display-3">Something went wrong</h1>
        <p className="text-lg text-stone-600">This page didn’t load. Your money isn’t affected. Try again.</p>
        <button onClick={reset} className="pill-ink">
          Try again
        </button>
        {error.digest && <p className="font-mono text-xs text-stone-500">Reference {error.digest}</p>}
      </div>
    </div>
  );
}
