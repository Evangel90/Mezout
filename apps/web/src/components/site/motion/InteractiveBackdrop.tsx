"use client";

import { useEffect, useRef } from "react";

/**
 * The dark sections' background: soft orange (humans) and violet (agents) glows over a faint grid. With a fine
 * pointer, a spotlight follows the cursor, the grid brightens around it and the glows drift gently toward it.
 *
 * Cost: one passive pointermove listener on the section writes a target; a requestAnimationFrame loop eases CSS
 * custom properties toward it and stops once settled. No React re-render per move, no canvas. The loop is off while
 * the section is off screen, and the whole effect is off for touch (coarse) pointers and prefers-reduced-motion,
 * which get the static background.
 */
export function InteractiveBackdrop({ variant = "hero" }: { variant?: "hero" | "agents" }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const fine = window.matchMedia("(pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || reduced.matches) return;

    const target = { x: 0.5, y: 0.35, a: 0 };
    const now = { x: 0.5, y: 0.35, a: 0 };
    let frame = 0;
    let visible = true;

    const tick = () => {
      frame = 0;
      const k = 0.12;
      now.x += (target.x - now.x) * k;
      now.y += (target.y - now.y) * k;
      now.a += (target.a - now.a) * 0.08;
      el.style.setProperty("--mx", `${(now.x * 100).toFixed(2)}%`);
      el.style.setProperty("--my", `${(now.y * 100).toFixed(2)}%`);
      el.style.setProperty("--dx", (now.x - 0.5).toFixed(4));
      el.style.setProperty("--dy", (now.y - 0.5).toFixed(4));
      el.style.setProperty("--spot", now.a.toFixed(3));
      const settled = Math.abs(target.x - now.x) < 0.0005 && Math.abs(target.y - now.y) < 0.0005 && Math.abs(target.a - now.a) < 0.002;
      if (!settled && visible) frame = requestAnimationFrame(tick);
    };
    const kick = () => {
      if (!frame && visible) frame = requestAnimationFrame(tick);
    };

    let rect = host.getBoundingClientRect();
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      target.x = (e.clientX - rect.left) / rect.width;
      target.y = (e.clientY - rect.top) / rect.height;
      target.a = 1;
      kick();
    };
    const onEnter = () => {
      rect = host.getBoundingClientRect();
    };
    const onLeave = () => {
      target.a = 0;
      target.x = 0.5;
      target.y = 0.35;
      kick();
    };
    const onScroll = () => {
      rect = host.getBoundingClientRect();
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) kick();
    });
    io.observe(host);
    host.addEventListener("pointerenter", onEnter);
    host.addEventListener("pointermove", onMove, { passive: true });
    host.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      host.removeEventListener("pointerenter", onEnter);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const glows =
    variant === "hero"
      ? [
          { cls: "left-[-10%] top-[-10%] h-[70%] w-[55%] bg-[radial-gradient(closest-side,rgba(255,107,20,0.24),transparent)]", drift: 40 },
          { cls: "right-[-10%] top-[-5%] h-[75%] w-[55%] bg-[radial-gradient(closest-side,rgba(127,92,255,0.28),transparent)]", drift: -40 },
          { cls: "bottom-[-25%] left-[20%] h-[60%] w-[60%] bg-[radial-gradient(closest-side,rgba(20,171,100,0.16),transparent)]", drift: 24 },
        ]
      : [
          { cls: "right-[-10%] top-[-20%] h-[70%] w-[55%] bg-[radial-gradient(closest-side,rgba(127,92,255,0.2),transparent)]", drift: -36 },
          { cls: "bottom-[-20%] left-[-10%] h-[60%] w-[50%] bg-[radial-gradient(closest-side,rgba(255,107,20,0.12),transparent)]", drift: 28 },
        ];

  const grid =
    "bg-[linear-gradient(to_right,var(--grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid)_1px,transparent_1px)] bg-[size:64px_64px]";

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      style={{ ["--mx" as string]: "50%", ["--my" as string]: "35%", ["--dx" as string]: 0, ["--dy" as string]: 0, ["--spot" as string]: 0 }}
    >
      {glows.map((g, i) => (
        <div
          key={i}
          className={`absolute ${g.cls} ${i % 2 ? "ambient-b" : "ambient-a"}`}
          style={{ transform: `translate3d(calc(var(--dx) * ${g.drift}px), calc(var(--dy) * ${g.drift}px), 0)` }}
        />
      ))}
      {/* Faint grid everywhere, fading out toward the edges. */}
      <div
        className={`absolute inset-0 ${grid} [mask-image:radial-gradient(70%_60%_at_50%_30%,black,transparent)]`}
        style={{ ["--grid" as string]: "rgba(255,255,255,0.04)" }}
      />
      {/* Brighter grid lines only near the cursor. */}
      <div
        className={`absolute inset-0 ${grid}`}
        style={{
          ["--grid" as string]: "rgba(255,255,255,0.16)",
          opacity: "var(--spot)",
          maskImage: "radial-gradient(260px circle at var(--mx) var(--my), black, transparent 75%)",
          WebkitMaskImage: "radial-gradient(260px circle at var(--mx) var(--my), black, transparent 75%)",
        }}
      />
      {/* The spotlight itself. */}
      <div
        className="absolute inset-0"
        style={{
          opacity: "var(--spot)",
          background: "radial-gradient(520px circle at var(--mx) var(--my), rgba(255,255,255,0.07), transparent 70%)",
        }}
      />
    </div>
  );
}
