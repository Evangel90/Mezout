"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Wait this long before showing the bar, so instant navigations don't flash it. */
const SHOW_DELAY_MS = 120;
/** Give up after this long, so a navigation that never happens (cancelled or failed) can't leave the bar stuck. */
const GIVE_UP_MS = 15_000;

/**
 * A thin bar across the top of the window while the next page loads. It starts when a same-site link is clicked
 * (or the browser's back/forward is used), creeps towards 90% while waiting, and completes when the URL changes.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState<number | null>(null);
  const timers = useRef<{ show?: number; trickle?: number; hide?: number; giveUp?: number }>({});
  const active = useRef(false);

  const clear = () => {
    window.clearTimeout(timers.current.show);
    window.clearInterval(timers.current.trickle);
    window.clearTimeout(timers.current.hide);
    window.clearTimeout(timers.current.giveUp);
  };

  // Finish whenever the route actually changes.
  useEffect(() => {
    if (!active.current) return;
    active.current = false;
    clear();
    setProgress(100);
    timers.current.hide = window.setTimeout(() => setProgress(null), 250);
  }, [pathname, searchParams]);

  useEffect(() => {
    const start = () => {
      clear();
      active.current = true;
      timers.current.show = window.setTimeout(() => {
        setProgress(8);
        timers.current.trickle = window.setInterval(() => {
          // Ease towards 90%: big steps at first, smaller as it waits.
          setProgress((p) => (p === null || p >= 90 ? p : p + (90 - p) * 0.08));
        }, 200);
      }, SHOW_DELAY_MS);
      timers.current.giveUp = window.setTimeout(() => {
        active.current = false;
        clear();
        setProgress(null);
      }, GIVE_UP_MS);
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !a.href || a.hasAttribute("download") || (a.target && a.target !== "_self")) return;
      const next = new URL(a.href, window.location.href);
      if (next.origin !== window.location.origin) return;
      // Same page or a hash on it: nothing loads.
      if (next.pathname === window.location.pathname && next.search === window.location.search) return;
      start();
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", start);
      clear();
    };
  }, []);

  const visible = progress !== null;
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2.5px]"
        style={{ opacity: visible && progress < 100 ? 1 : 0, transition: "opacity 250ms ease" }}
      >
        <div
          className="h-full origin-left bg-signal-500 shadow-[0_0_8px_rgba(255,107,20,0.6)]"
          style={{
            transform: `scaleX(${(progress ?? 0) / 100})`,
            transition: visible ? "transform 200ms ease-out" : "none",
          }}
        />
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {visible && progress < 100 ? "Loading page" : ""}
      </span>
    </>
  );
}
