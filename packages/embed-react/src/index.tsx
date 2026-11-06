import { useEffect, useMemo, useRef, useState } from "react";

export type MezoutPaidEvent = { type: "mezout:paid"; orderId: string; txHash: string | null };

export type MezoutCheckoutProps = {
  checkoutUrl: string;
  open: boolean;
  onClose: () => void;
  onPaid?: (event: MezoutPaidEvent) => void;
  title?: string;
};

function embeddedUrl(checkoutUrl: string) {
  const url = new URL(checkoutUrl);
  url.searchParams.set("embed", "1");
  return url;
}

/**
 * Controlled Mezout checkout modal. `onPaid` updates interface state only; merchants must fulfil orders from the
 * signed `invoice.paid` webhook or a server-side invoice lookup.
 */
export function MezoutCheckout({ checkoutUrl, open, onClose, onPaid, title = "Complete payment" }: MezoutCheckoutProps) {
  const url = useMemo(() => embeddedUrl(checkoutUrl), [checkoutUrl]);
  const frame = useRef<HTMLIFrameElement>(null);
  const popup = useRef<Window | null>(null);
  const [usingPopup, setUsingPopup] = useState(false);

  useEffect(() => {
    if (!open) return;
    function receive(event: MessageEvent) {
      if (event.origin !== url.origin || (event.source !== frame.current?.contentWindow && event.source !== popup.current)) return;
      if (event.data?.type === "mezout:paid") onPaid?.(event.data as MezoutPaidEvent);
      if (event.data?.type === "mezout:closed") onClose();
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [open, onClose, onPaid, url.origin]);

  useEffect(() => {
    if (!open) {
      popup.current?.close();
      popup.current = null;
      setUsingPopup(false);
    }
  }, [open]);

  if (!open) return null;

  function openPopup() {
    popup.current = window.open(url.toString(), "mezout-checkout", "popup,width=520,height=760");
    if (popup.current) setUsingPopup(true);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{ position: "fixed", inset: 0, zIndex: 2147483647, display: "grid", placeItems: "center", padding: 16, background: "rgb(28 25 23 / 0.55)" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div style={{ width: "min(100%, 520px)", height: "min(780px, calc(100vh - 32px))", overflow: "hidden", borderRadius: 16, background: "white", boxShadow: "0 24px 80px rgb(0 0 0 / 0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderBottom: "1px solid #e7e5e4" }}>
          <strong style={{ font: "600 15px system-ui, sans-serif" }}>{title}</strong>
          <div style={{ display: "flex", gap: 12 }}>
            <button type="button" onClick={openPopup} style={{ border: 0, padding: 0, background: "transparent", textDecoration: "underline", cursor: "pointer" }}>
              Open in new window
            </button>
            <button type="button" onClick={onClose} aria-label="Close checkout" style={{ border: 0, padding: 0, background: "transparent", fontSize: 22, cursor: "pointer" }}>
              ×
            </button>
          </div>
        </div>
        {usingPopup ? (
          <div style={{ padding: 24, font: "14px system-ui, sans-serif" }}>Checkout opened in a new window. Keep this page open while you pay.</div>
        ) : (
          <iframe ref={frame} src={url.toString()} title={title} allow="clipboard-write" referrerPolicy="strict-origin" style={{ width: "100%", height: "calc(100% - 49px)", border: 0 }} />
        )}
      </div>
    </div>
  );
}
