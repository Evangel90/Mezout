"use client";

import { useState } from "react";

/** A one-line terminal command with a copy button, for dark sections. */
export function CommandLine({ command, size = "md" }: { command: string; size?: "md" | "lg" }) {
  const lg = size === "lg";
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked: the command is still selectable.
    }
  };
  return (
    <div
      className={`relative flex items-center gap-3 border border-white/15 bg-stone-950 font-mono ${
        lg ? "rounded-[1.4rem] py-3 pl-6 pr-3 text-[15px] sm:text-xl" : "rounded-2xl py-2 pl-5 pr-2 text-[14px]"
      }`}
    >
      <span aria-hidden className="select-none text-stone-500">
        $
      </span>
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-stone-100">{command}</code>
      <button
        type="button"
        onClick={copy}
        className={`shrink-0 font-sans font-medium transition-colors ${
          lg
            ? "rounded-xl bg-white px-4 py-2.5 text-sm text-ink hover:bg-stone-200"
            : "rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-stone-200 hover:bg-white/10 hover:text-white"
        }`}
      >
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}
