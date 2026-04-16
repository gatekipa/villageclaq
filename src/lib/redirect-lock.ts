"use client";

/**
 * Redirect lock — prevents duplicate redirects in rapid succession.
 *
 * **Why this exists:**
 * Multiple components (layout guard, provider, auth callback) can independently
 * decide to redirect. When two redirects fire within milliseconds, the second
 * can overwrite the first (e.g., layout redirects to onboarding, then a stale
 * effect redirects to dashboard). This lock makes the first redirect win and
 * rejects subsequent attempts within the lock window.
 *
 * See: src/ONBOARDING_REDIRECT_AUDIT.md
 */

const LOCK_WINDOW_MS = 2000;

let lastRedirectTime = 0;
let lastRedirectTarget = "";

/**
 * Attempt to acquire the redirect lock.
 *
 * @param target  The path being redirected to
 * @returns true if the redirect should proceed, false if it should be suppressed
 */
export function acquireRedirectLock(target: string): boolean {
  const now = Date.now();

  if (now - lastRedirectTime < LOCK_WINDOW_MS) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[REDIRECT-LOCK] Blocked duplicate redirect to "${target}" — ` +
        `already redirecting to "${lastRedirectTarget}" ` +
        `(${now - lastRedirectTime}ms ago)`
      );
    }
    return false;
  }

  lastRedirectTime = now;
  lastRedirectTarget = target;
  return true;
}

/**
 * Reset the redirect lock. Call this when navigation completes
 * or when the component unmounts to prevent stale locks.
 */
export function resetRedirectLock(): void {
  lastRedirectTime = 0;
  lastRedirectTarget = "";
}

/**
 * Check if a redirect is currently in progress (within the lock window).
 */
export function isRedirectInProgress(): boolean {
  return Date.now() - lastRedirectTime < LOCK_WINDOW_MS;
}
