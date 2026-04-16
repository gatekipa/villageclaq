# Onboarding Redirect Audit

**Date:** 2026-04-16
**Trigger:** 0-membership users landing on stateless dashboard instead of onboarding after email confirmation
**Bug recurrence count:** Multiple "fixes" that kept regressing

## Complete Flow Map

```
Email confirmation link clicked
  ↓
/auth/callback?code=...&next=/dashboard     (src/app/auth/callback/route.ts)
  ↓
exchangeCodeForSession(code)
  ↓
getUser() → count memberships → count invitations
  ↓
getPostAuthRedirect(membershipCount, inviteCount)   (src/lib/auth-redirect.ts)
  ├─ memberships > 0  → /dashboard
  ├─ invitations > 0  → /dashboard/my-invitations
  └─ both 0           → /dashboard/onboarding/group
  ↓
intl middleware adds locale prefix (/en/dashboard/onboarding/group)
  ↓
(dashboard) layout.tsx mounts → GroupProvider → DashboardGuard
  ↓
DashboardGuard (BLOCKING enforcement layer):
  ├─ pathname includes /onboarding → render children (pass through)
  ├─ loading=true → show spinner
  ├─ memberships.length === 0 → show spinner + fire redirect effect
  └─ memberships.length > 0 → render dashboard
```

## Root Causes Found

### RC-1: Auth callback did not redirect 0-membership users (PRIMARY)
**File:** `src/app/auth/callback/route.ts:43-73`
**Mechanism:** The callback checked for pending invitations when memberships=0, but if invitations were also 0, it fell through to `redirect(/dashboard)` — sending the user to a stateless dashboard.
**Fix:** Use `getPostAuthRedirect()` which returns `/dashboard/onboarding/group` for 0-membership, 0-invitation users.

### RC-2: Second auth callback had no membership check at all
**File:** `src/app/[locale]/(auth)/callback/route.ts`
**Mechanism:** This callback only exchanged the code and redirected to `/dashboard` unconditionally. No membership awareness.
**Fix:** Added identical `getPostAuthRedirect()` logic.

### RC-3: DashboardGuard could flash content during redirect transition
**File:** `src/app/[locale]/(dashboard)/layout.tsx:405-414`
**Mechanism:** The 0-membership guard only blocked while `!checkedInvitations`. After the invitation check completed and the redirect was dispatched, the guard stopped blocking — but Next.js client-side navigation is async, so children could briefly render during the transition.
**Fix:** Changed the guard to block ALL 0-membership users unconditionally (not gated on `checkedInvitations`). The guard stays up until the component unmounts (redirect completes) or memberships become > 0.

### RC-4: No redirect deduplication
**Mechanism:** Multiple layers (callback, layout guard, invitation check effect) could independently fire redirects. If two fired in quick succession, the second could overwrite the first.
**Fix:** Created `src/lib/redirect-lock.ts` with `acquireRedirectLock()` that rejects duplicate redirects within 2 seconds.

## Redirect Inventory

| # | File:Line | Trigger | Target | Side | Risk | Decision |
|---|-----------|---------|--------|------|------|----------|
| 1 | `src/app/auth/callback/route.ts:84` | 0 memberships, server-side | `getPostAuthRedirect()` | Server | LOW | KEEP — primary redirect |
| 2 | `src/app/[locale]/(auth)/callback/route.ts:64` | 0 memberships, server-side | `getPostAuthRedirect()` | Server | LOW | KEEP — locale callback |
| 3 | `src/app/[locale]/(dashboard)/layout.tsx:370-388` | 0 memberships, client-side | onboarding or invitations | Client | LOW | KEEP — enforcement layer |
| 4 | `src/app/[locale]/(dashboard)/layout.tsx:437-446` | 0 memberships, blocking UI | spinner (not a redirect) | Client | NONE | KEEP — prevents content flash |
| 5 | `src/lib/supabase/middleware.ts:55-61` | unauthenticated → login | `/login` | Server | NONE | KEEP — unrelated |
| 6 | `src/lib/supabase/middleware.ts:64-78` | authenticated on auth page → dashboard | `/dashboard` | Server | LOW | KEEP — but uses default `/dashboard` not membership-aware |
| 7 | `src/components/layout/group-switcher.tsx:124` | user clicks "Create group" | `/dashboard/onboarding/group` | Client | NONE | KEEP — intentional nav |
| 8 | `src/app/[locale]/(dashboard)/dashboard/onboarding/group/page.tsx:623` | group creation complete | `/dashboard` | Client | NONE | KEEP — post-onboarding |

## Failure Pattern Analysis

| Pattern | Status | Evidence |
|---------|--------|----------|
| 3.1 Race condition (dashboard renders before memberships resolve) | FIXED | Guard blocks ALL 0-membership users unconditionally (layout.tsx:437) |
| 3.2 Async overwrite (one redirect overwrites another) | FIXED | redirect-lock.ts prevents duplicates within 2s window |
| 3.3 Loading-state bug (empty dashboard during loading) | NOT PRESENT | Guard shows spinner while loading=true (layout.tsx:422) |
| 3.4 Multi-redirect collision | FIXED | Both callback routes + layout guard use shared getPostAuthRedirect() |
| 3.5 Stale cache/session data | NOT PRESENT | GroupProvider fetches fresh on mount, TanStack Query has staleTime:60s |
| 3.6 Guard ordering (guard runs before fetch) | NOT PRESENT | Guard checks loading flag, waits for fetch to complete |
| 3.7 SSR vs CSR mismatch | NOT PRESENT | Layout is "use client", no server component rendering dashboard |
| 3.8 Empty-state masking | FIXED | 0-membership guard is unconditional, no content passes through |
| 3.9 Onboarding loop risk | NOT PRESENT | isOnboardingPage check at layout.tsx:411 returns children immediately |
| 3.10 Locale/path mismatch | NOT PRESENT | pathname.includes() is locale-safe, intl middleware adds prefix |

## Architecture After Fix

```
┌─────────────────────────────────────────────────┐
│  src/lib/auth-redirect.ts                       │
│  ┌─────────────────────────────────────────┐    │
│  │ getPostAuthRedirect(memberships, invites)│    │
│  │ isZeroMembershipAllowedPath(pathname)    │    │
│  │ logRedirectDecision(detail)              │    │
│  └─────────────────────────────────────────┘    │
│  Single source of truth — all layers call this  │
└────────────┬──────────────────┬─────────────────┘
             │                  │
    ┌────────▼────────┐  ┌─────▼──────────────────┐
    │ Auth Callbacks   │  │ Dashboard Layout Guard  │
    │ (server-side)    │  │ (client-side)           │
    │ EARLIEST decision│  │ BLOCKING enforcement    │
    │ Redirects before │  │ No content renders      │
    │ client loads     │  │ until memberships > 0   │
    └─────────────────┘  └─────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │ src/lib/redirect-   │
                    │ lock.ts             │
                    │ Deduplicates rapid  │
                    │ redirect attempts   │
                    └─────────────────────┘
```

## Files Changed

| File | What Changed |
|------|-------------|
| `src/lib/auth-redirect.ts` | NEW — shared redirect decision logic |
| `src/lib/redirect-lock.ts` | NEW — duplicate redirect prevention |
| `src/app/auth/callback/route.ts` | Uses getPostAuthRedirect() for 0-membership routing |
| `src/app/[locale]/(auth)/callback/route.ts` | Added membership check + getPostAuthRedirect() |
| `src/app/[locale]/(dashboard)/layout.tsx` | Hardened 0-membership guard, added redirect lock, logging |
| `CLAUDE.md` | Added rule #10 — onboarding redirect enforcement |

## Known Risks / Follow-Up

1. **Middleware not membership-aware:** `src/lib/supabase/middleware.ts:64-78` redirects authenticated users on auth pages to `/dashboard` without checking memberships. This is acceptable because:
   - It only fires when an authenticated user visits `/login` or `/signup`
   - The dashboard layout guard catches them immediately
   - Making middleware membership-aware would add a DB query to every request

2. **Runtime verification:** Code-traced only. True end-to-end testing (sign up → confirm email → verify landing page) requires a live Supabase instance. The fix has been verified through static code analysis of every redirect path.

## Verification Checklist

- [x] Both auth callbacks use getPostAuthRedirect()
- [x] No inline membership redirect logic outside shared utility
- [x] Dashboard guard blocks ALL 0-membership users (no content flash)
- [x] Onboarding route exempt from redirect-away logic
- [x] Redirect lock prevents duplicate redirects
- [x] Dev logging shows redirect decisions
- [x] No remaining direct /onboarding redirects bypass shared utility
- [x] CLAUDE.md updated with rule #10
