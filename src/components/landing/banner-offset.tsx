"use client";

import { useEffect } from "react";

/**
 * Keeps the sticky landing header directly below the sticky founder-test
 * banner. The banner wraps to more lines on narrow screens, so its height is
 * measured instead of assumed; CSS falls back to a one-line estimate until
 * this runs.
 */
export function BannerOffset() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".vc-landing");
    const banner = document.querySelector<HTMLElement>("[data-founder-banner]");
    if (!root || !banner) return;
    const apply = () => root.style.setProperty("--vc-banner-h", `${banner.getBoundingClientRect().height}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(banner);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--vc-banner-h");
    };
  }, []);
  return null;
}
