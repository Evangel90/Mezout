/**
 * The Mezout mark: a receipt whose tear-off edge is a check mark. The tile takes the text colour; the check takes
 * `check` (white by default; on dark surfaces pass a dark check with a light tile).
 */
export function LogoMark({ className = "h-6 w-6", check = "white" }: { className?: string; check?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M10 16.5l4 4 8-9" fill="none" stroke={check} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mark and name together, as the header and footer show them. */
export function Wordmark({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[17px] font-semibold tracking-[-0.03em] ${dark ? "text-white" : "text-ink"} ${className}`}>
      <LogoMark className="h-7 w-7" check={dark ? "#0c0a09" : "white"} />
      Mezout
    </span>
  );
}
