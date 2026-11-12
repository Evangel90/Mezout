"use client";

import { useEffect } from "react";

const SELECTOR = ".reveal, .reveal-scale, .reveal-group";

/**
 * Reveals landing page blocks once, as they enter the viewport. Elements that arrive together are staggered top to
 * bottom, left to right; children of a `.reveal-group` are staggered in order. The `js-reveal` class that hides them
 * is set by the inline script in the root layout before first paint, so nothing flashes; with reduced motion that
 * script doesn't run and everything is simply visible.
 */
export function ScrollReveal() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains("js-reveal")) return;
    root.dataset.revealReady = "1";

    document.querySelectorAll<HTMLElement>(".reveal-group").forEach((group) => {
      Array.from(group.children).forEach((child, i) => (child as HTMLElement).style.setProperty("--i", String(i)));
    });

    const io = new IntersectionObserver(
      (entries) => {
        const arriving = entries
          .filter((e) => e.isIntersecting)
          .map((e) => e.target as HTMLElement)
          .sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            return Math.abs(ra.top - rb.top) > 24 ? ra.top - rb.top : ra.left - rb.left;
          });
        arriving.forEach((el, n) => {
          if (!el.classList.contains("reveal-group")) el.style.setProperty("--i", String(Math.min(n, 5)));
          el.classList.add("in");
          io.unobserve(el);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    document.querySelectorAll(SELECTOR).forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
