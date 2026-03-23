"use client";

import { useEffect } from "react";
import { usePathname } from "@/i18n/routing";

/** Scrolls to top when the route changes */
export function ScrollToTopOnNav() {
  const pathname = usePathname();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return null;
}
