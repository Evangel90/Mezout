"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Drives a looping, step-based animation: returns the current step (0 … steps-1) and a ref for the element whose
 * visibility gates it. The loop only runs while the element is on screen. With `prefers-reduced-motion`, it holds
 * the final step, so the scene shows its finished state without moving.
 */
export function useTimeline<T extends HTMLElement>(steps: number, stepMs: number) {
  const ref = useRef<T>(null);
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setRunning(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || !running) return;
    const t = setInterval(() => setStep((s) => (s + 1) % steps), stepMs);
    return () => clearInterval(t);
  }, [reduced, running, steps, stepMs]);

  return { ref, step: reduced ? steps - 1 : step, reduced };
}
