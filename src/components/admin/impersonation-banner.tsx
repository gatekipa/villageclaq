"use client";

/**
 * Fixed-top banner rendered by the admin layout whenever the current
 * platform staff member has an active impersonation session. Polls
 * /api/admin/impersonate/active every 30 seconds so it appears/
 * disappears without a full page reload.
 *
 * All actions during an active session are audit-logged by the
 * RPCs that write platform_audit_logs — the banner itself is purely
 * UI surface to make the active state obvious.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertOctagon, Loader2, LogOut } from "lucide-react";

interface ActiveSession {
  id: string;
  impersonatedUserId: string;
  impersonatedName: string | null;
  startedAt: string;
  reason: string;
  supportTicketId: string | null;
}

export function ImpersonationBanner() {
  const t = useTranslations("admin");
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [ending, setEnding] = useState(false);

  async function fetchActive() {
    try {
      const res = await fetch("/api/admin/impersonate/active", {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status !== 401) {
          console.warn("[ImpersonationBanner] active lookup failed:", res.status);
        }
        setSession(null);
        return;
      }
      const body = (await res.json()) as { active: ActiveSession | null };
      setSession(body.active);
    } catch (err) {
      console.warn(
        "[ImpersonationBanner] fetch failed:",
        err instanceof Error ? err.message : err,
      );
      setSession(null);
    }
  }

  useEffect(() => {
    fetchActive();
    const interval = setInterval(fetchActive, 30_000);
    return () => clearInterval(interval);
  }, []);

  async function handleEnd() {
    if (!session || ending) return;
    setEnding(true);
    try {
      const res = await fetch("/api/admin/impersonate/end", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });
      if (!res.ok) {
        console.warn("[ImpersonationBanner] end failed:", res.status);
        return;
      }
      setSession(null);
    } finally {
      setEnding(false);
    }
  }

  if (!session) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 border-b border-red-900/40 bg-red-600 px-4 py-2 text-sm text-white shadow-sm"
    >
      <div className="flex items-center gap-2">
        <AlertOctagon className="h-4 w-4 shrink-0" />
        <span className="font-semibold">
          {t("impersonationBannerTitle", {
            name: session.impersonatedName || t("impersonationUnknownUser"),
          })}
        </span>
        <span className="hidden text-red-100 sm:inline">
          {t("impersonationBannerAudited")}
        </span>
      </div>
      <button
        onClick={handleEnd}
        disabled={ending}
        className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/20 disabled:opacity-60"
      >
        {ending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <LogOut className="h-3 w-3" />
        )}
        {t("impersonationEnd")}
      </button>
    </div>
  );
}
