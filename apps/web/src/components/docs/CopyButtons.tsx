"use client";

import { useEffect } from "react";

/** Makes the `[data-copy]` buttons inside the rendered docs copy the code block next to them. */
export function CopyButtons({ containerId }: { containerId: string }) {
  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const onClick = async (e: MouseEvent) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-copy]");
      const code = button?.closest(".code-block")?.querySelector("code");
      if (!button || !code) return;
      try {
        await navigator.clipboard.writeText(code.textContent ?? "");
        button.textContent = "Copied";
      } catch {
        button.textContent = "Press Ctrl+C";
      }
      setTimeout(() => (button.textContent = "Copy"), 1500);
    };
    container.addEventListener("click", onClick);
    return () => container.removeEventListener("click", onClick);
  }, [containerId]);
  return null;
}
