"use client";

/**
 * Mezout's small design system: buttons, cards, form fields, badges, notices, empty states and dialogs. Everything is
 * stone neutrals with green, amber and red for state, so the dashboard and checkout read as one product.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

/* Buttons ------------------------------------------------------------------------------------------------------- */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-outline";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-stone-900 text-white hover:bg-stone-700 disabled:hover:bg-stone-900",
  secondary: "border border-stone-300 bg-white text-stone-900 hover:bg-stone-50 disabled:hover:bg-white",
  ghost: "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
  danger: "bg-red-700 text-white hover:bg-red-600 disabled:hover:bg-red-700",
  "danger-outline": "border border-red-200 bg-white text-red-700 hover:bg-red-50",
};
const SIZE: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-3 text-sm",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-5 text-base",
};

/** Class names for a button, or a link styled as one. */
export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass(variant, size, className)} {...props}>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

/* Layout -------------------------------------------------------------------------------------------------------- */

export const cardClass = "rounded-xl border border-stone-200 bg-white shadow-sm shadow-stone-900/[0.03]";

export function Card({ className = "", children, id }: { className?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className={`${cardClass} ${className}`}>
      {children}
    </section>
  );
}

/** A card's title row: heading, a line of explanation, and an optional action on the right. */
export function CardHeader({
  title,
  description,
  action,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 max-w-2xl space-y-1">
        <h2 id={id} className="text-base font-semibold text-stone-900">
          {title}
        </h2>
        {description && <p className="text-sm leading-relaxed text-stone-600">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

/** A dashboard page's heading. */
export function PageHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-stone-600">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

/* Forms --------------------------------------------------------------------------------------------------------- */

export const inputClass =
  "block w-full min-w-0 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 transition-colors hover:border-stone-400 focus:border-stone-900 disabled:bg-stone-50 disabled:text-stone-500 aria-[invalid=true]:border-red-500";

/**
 * A labelled form control. `children` receives the ids to wire up, so the label, hint and error are always announced
 * with the input.
 */
export function Field({
  label,
  hint,
  error,
  optional,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  children: (ids: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-medium text-stone-900">
        {label}
        {optional && <span className="text-xs font-normal text-stone-500">Optional</span>}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-stone-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** A text input with a unit shown inside its right edge, such as "MUSD". */
export function UnitInput({ unit, className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement> & { unit: string }) {
  return (
    <div className="relative">
      <input {...props} className={`${inputClass} pr-16 tabular-nums ${className}`} />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-stone-500">{unit}</span>
    </div>
  );
}

/* Status -------------------------------------------------------------------------------------------------------- */

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "orange";

const BADGE: Record<Tone, string> = {
  neutral: "bg-stone-100 text-stone-700 ring-stone-200",
  success: "bg-green-50 text-green-800 ring-green-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
  info: "bg-blue-50 text-blue-800 ring-blue-200",
  orange: "bg-orange-50 text-orange-900 ring-orange-200",
};
const DOT: Record<Tone, string> = {
  neutral: "bg-stone-400",
  success: "bg-green-600",
  warning: "bg-amber-500",
  danger: "bg-red-600",
  info: "bg-blue-600",
  orange: "bg-orange-500",
};

export function Badge({ tone = "neutral", children, dot = true }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE[tone]}`}>
      {dot && <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />}
      {children}
    </span>
  );
}

const ALERT: Record<Exclude<Tone, "orange" | "neutral"> | "neutral", string> = {
  neutral: "border-stone-200 bg-stone-50 text-stone-800",
  success: "border-green-200 bg-green-50 text-green-900",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  danger: "border-red-200 bg-red-50 text-red-900",
  info: "border-blue-200 bg-blue-50 text-blue-950",
};

/** An inline notice. Errors are announced to screen readers as soon as they appear. */
export function Alert({
  tone = "neutral",
  title,
  children,
  action,
  className = "",
}: {
  tone?: keyof typeof ALERT;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${ALERT[tone]} ${className}`}>
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`shrink-0 motion-safe:animate-spin ${className}`} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** A grey placeholder bar shown while data loads. */
export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <span aria-hidden className={`block rounded-md bg-stone-200/70 motion-safe:animate-pulse ${className}`} />;
}

/** A centred loading message for a page or panel. */
export function Loading({ label = "Loading…", className = "py-16" }: { label?: string; className?: string }) {
  return (
    <div role="status" className={`flex items-center justify-center gap-2 text-sm text-stone-500 ${className}`}>
      <Spinner className="h-4 w-4" />
      {label}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-stone-300 px-6 py-10 text-center">
      {icon && <span className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-600">{icon}</span>}
      <div className="max-w-sm space-y-1">
        <p className="font-medium text-stone-900">{title}</p>
        {children && <p className="text-sm text-stone-600">{children}</p>}
      </div>
      {action}
    </div>
  );
}

/* Copying ------------------------------------------------------------------------------------------------------- */

/** Copies text to the clipboard and confirms it for a moment, visually and to screen readers. */
export function useCopy(ms = 1500) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), ms);
      } catch {
        setCopied(false);
      }
    },
    [ms],
  );
  return { copied, copy };
}

export function CopyButton({
  text,
  label = "Copy",
  variant = "secondary",
  size = "sm",
  className = "",
}: {
  text: string;
  label?: string;
  variant?: Variant;
  size?: Size;
  className?: string;
}) {
  const { copied, copy } = useCopy();
  return (
    <Button variant={variant} size={size} onClick={() => copy(text)} className={className}>
      {copied ? <CheckIcon className="h-4 w-4 text-green-700" /> : <CopyIcon className="h-4 w-4" />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </Button>
  );
}

/* Dialogs ------------------------------------------------------------------------------------------------------- */

/**
 * A modal dialog. It is a plain overlay rather than a native <dialog>, so wallet pop-ups that render into the page
 * stay usable above it. Escape and the backdrop close it; focus moves in on open and back on close.
 */
export function Dialog({
  open,
  title,
  description,
  children,
  footer,
  onClose,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    const focusable = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href], textarea, select, [tabindex]:not([tabindex='-1'])") ?? []);
    (panel?.querySelector<HTMLElement>("[data-autofocus]") ?? focusable()[0] ?? panel)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab") {
        const items = focusable();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
    // onClose changes identity on every render; the effect only needs to run when the dialog opens or closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div aria-hidden className="absolute inset-0 bg-stone-950/40" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className="relative w-full max-w-md space-y-5 rounded-2xl bg-white p-6 shadow-xl outline-none"
      >
        <div className="space-y-1.5">
          <h2 id={titleId} className="text-lg font-semibold text-stone-900">
            {title}
          </h2>
          {description && (
            <div id={descId} className="text-sm leading-relaxed text-stone-600">
              {description}
            </div>
          )}
        </div>
        {children}
        {footer && <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}

type ConfirmOptions = { title: string; description?: ReactNode; confirmLabel: string; danger?: boolean };

/**
 * `await confirm({...})` resolves true when the merchant confirms. Render `dialog` once in the component. Cancel has
 * the focus first, so a stray Enter never confirms a destructive action.
 */
export function useConfirm() {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })), []);
  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };
  const dialog = (
    <Dialog
      open={!!pending}
      title={pending?.title}
      description={pending?.description}
      onClose={() => close(false)}
      footer={
        <>
          <Button variant="secondary" data-autofocus onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant={pending?.danger ? "danger" : "primary"} onClick={() => close(true)}>
            {pending?.confirmLabel}
          </Button>
        </>
      }
    />
  );
  return { confirm, dialog };
}

/* Amounts ------------------------------------------------------------------------------------------------------- */

/** "1,234.5" from a decimal string, without floating-point surprises for typical amounts. */
export function formatAmount(value: string | number, maxDigits = 6) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: maxDigits });
}

/** Gross, fee and net for one payment, as a definition list. */
export function AmountBreakdown({ gross, fee, net, compact = false }: { gross: string; fee: string; net: string; compact?: boolean }) {
  const row = compact ? "flex justify-between gap-4 py-1" : "flex justify-between gap-4 py-1.5";
  return (
    <dl className="divide-y divide-stone-100 text-sm tabular-nums">
      <div className={row}>
        <dt className="text-stone-600">Customer pays</dt>
        <dd className="text-stone-900">{formatAmount(gross)} MUSD</dd>
      </div>
      <div className={row}>
        <dt className="text-stone-600">Platform fee</dt>
        <dd className="text-stone-900">−{formatAmount(fee)} MUSD</dd>
      </div>
      <div className={row}>
        <dt className="font-medium text-stone-900">You receive</dt>
        <dd className="font-semibold text-stone-900">{formatAmount(net)} MUSD</dd>
      </div>
    </dl>
  );
}

/* Icons --------------------------------------------------------------------------------------------------------- */

function icon(d: string) {
  return function Icon({ className = "h-5 w-5" }: { className?: string }) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden>
        <path d={d} />
      </svg>
    );
  };
}

export const CopyIcon = icon("M9 9h10v10H9zM5 15V5h10");
export const CheckIcon = icon("M5 12.5l4.5 4.5L19 7.5");
export const ExternalIcon = icon("M14 5h5v5M19 5l-8 8M18 14v5H5V6h5");
export const HomeIcon = icon("M4 11l8-7 8 7M6 9.5V20h12V9.5");
export const ReceiptIcon = icon("M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6");
export const CodeIcon = icon("M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14");
export const UserIcon = icon("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0");
export const LinkIcon = icon("M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1");
export const KeyIcon = icon("M14.5 9.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0zM13 13l7 7M17 17l2-2M15 15l2-2");
export const WebhookIcon = icon("M12 4a4 4 0 0 0-3.5 6L5 16M12 4a4 4 0 0 1 3.5 6M19 16h-7M5 16a3 3 0 1 0 3 3M19 16a3 3 0 1 1-3 3");
export const WalletIcon = icon("M3 7h18v13H3zM3 11h18M16 15.5h2M6 7l9-3 1 3");
export const ArrowRightIcon = icon("M5 12h14M13 6l6 6-6 6");
export const RefreshIcon = icon("M20 11a8 8 0 0 0-14.8-3.5M4 4v4h4M4 13a8 8 0 0 0 14.8 3.5M20 20v-4h-4");
export const DownloadIcon = icon("M12 4v11M7 10l5 5 5-5M5 20h14");
export const SearchIcon = icon("M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4");
export const PlusIcon = icon("M12 5v14M5 12h14");
export const ShieldIcon = icon("M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z");
export const ChevronIcon = icon("M9 6l6 6-6 6");
export const AlertIcon = icon("M12 9v4M12 17h.01M10.3 4.3L2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z");
