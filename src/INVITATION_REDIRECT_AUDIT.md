# Invitation → Signup → Redirect Flow Audit

**Date:** 2026-04-16
**Trigger:** New users without accounts cannot complete invitation acceptance — they see login page but have no account
**Method:** Static code inspection (TRACED CODE BEHAVIOR)

## Complete Flow Map

```
Admin creates invitation → stores in DB + sends email
  ↓
Email contains acceptUrl: https://villageclaq.com/{locale}/login?redirectTo=/dashboard/my-invitations
  ↓
New user clicks link → lands on /login?redirectTo=/dashboard/my-invitations
  ↓
Login page reads redirectTo (line 48) → user clicks "Sign up" link
  ↓
Signup link includes redirectTo: /signup?redirectTo=%2Fdashboard%2Fmy-invitations  (line 229)
  ↓
Signup page reads redirectTo (line 43) → user fills form → submits
  ↓
signUp() call sets emailRedirectTo: {origin}/auth/callback?next=%2Fdashboard%2Fmy-invitations  (line 106)
  ↓
Supabase sends confirmation email with that URL embedded
  ↓
User clicks confirm → Supabase redirects to /auth/callback?code=XXX&next=%2Fdashboard%2Fmy-invitations
  ↓
Auth callback reads next=/dashboard/my-invitations (line 25)
  ↓
next !== "/dashboard" → skip getPostAuthRedirect() → redirect to /dashboard/my-invitations (line 96)
  ↓
Intl middleware adds locale → /en/dashboard/my-invitations
  ↓
My-invitations page loads → queries invitations by email match (line 79)
  ↓
User sees and accepts pending invitation
```

## Invitation Creation Sites

| # | File:Line | acceptUrl Format | Param | Status |
|---|-----------|-----------------|-------|--------|
| 1 | `onboarding/group/page.tsx:598` | `login?next=/dashboard/my-invitations` | `next` | **FIXED** → `redirectTo` |
| 2 | `invitations/page.tsx:235` | `login?redirectTo=/dashboard/my-invitations` | `redirectTo` | CORRECT |
| 3 | `members/page.tsx:534` | `login?redirectTo=/dashboard/my-invitations` | `redirectTo` | CORRECT |
| 4 | `enterprise/branches/page.tsx:210` | `login?redirectTo=/dashboard/my-invitations` | `redirectTo` | CORRECT |

## Break Points Analysis

### BP-1: Onboarding acceptUrl uses wrong param name
**File:** `src/app/[locale]/(dashboard)/dashboard/onboarding/group/page.tsx:598`
**Before:** `?next=/dashboard/my-invitations`
**After:** `?redirectTo=/dashboard/my-invitations`
**Impact:** Login page read `redirectTo` → got null → redirectTo defaulted to `/dashboard` → chain broken
**Status:** FIXED

### BP-2: Login page does not read `next` param (defense gap)
**File:** `src/app/[locale]/(auth)/login/page.tsx:48`
**Before:** `searchParams.get("redirectTo")`
**After:** `searchParams.get("redirectTo") || searchParams.get("next")`
**Impact:** If any code generates `?next=` URLs, login page now handles it as fallback
**Status:** FIXED (defense in depth)

### BP-3: Signup page does not read `next` param (defense gap)
**File:** `src/app/[locale]/(auth)/signup/page.tsx:43`
**Before:** `searchParams.get("redirectTo")`
**After:** `searchParams.get("redirectTo") || searchParams.get("next")`
**Impact:** Same defense-in-depth as BP-2
**Status:** FIXED

### BP-4: Login "Sign up" link loses redirectTo
**File:** `src/app/[locale]/(auth)/login/page.tsx:229`
**Code:** `<Link href={redirectTo !== "/dashboard" ? /signup?redirectTo=... : "/signup"}>`
**Status:** NOT PRESENT — already preserves redirectTo correctly

### BP-5: Signup signUp() does not pass redirectTo
**File:** `src/app/[locale]/(auth)/signup/page.tsx:106`
**Code:** `emailRedirectTo: ${origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`
**Status:** NOT PRESENT — correctly passes redirectTo as `next` param

### BP-6: Auth callback ignores next param
**File:** `src/app/auth/callback/route.ts:25,49,96`
**Code:** Reads `next` (line 25). If `next === "/dashboard"`, runs getPostAuthRedirect (line 49). Otherwise honors `next` directly (line 96).
**Status:** NOT PRESENT — correctly honors non-default next values

### BP-7: Email template has wrong URL
**File:** `src/lib/email-templates/invitation.ts:41`
**Code:** Uses caller-provided `acceptUrl` — passes through correctly
**Status:** NOT PRESENT — template is a passthrough

## Redirect Chain Trace — New User (After Fix)

| Step | URL/Action | redirectTo Preserved? | File:Line |
|------|-----------|----------------------|-----------|
| 1. Admin sends invitation | acceptUrl=`login?redirectTo=/dashboard/my-invitations` | YES | onboarding:598 (FIXED) |
| 2. Email template | Renders acceptUrl as button link | YES (passthrough) | invitation.ts:41 |
| 3. User clicks email link | Lands on `/login?redirectTo=/dashboard/my-invitations` | YES | — |
| 4. Login page reads redirectTo | `searchParams.get("redirectTo")` → `/dashboard/my-invitations` | YES | login/page.tsx:48 |
| 5. User clicks "Sign up" | Navigates to `/signup?redirectTo=%2Fdashboard%2Fmy-invitations` | YES | login/page.tsx:229 |
| 6. Signup page reads redirectTo | `searchParams.get("redirectTo")` → `/dashboard/my-invitations` | YES | signup/page.tsx:43 |
| 7. User submits signup | `emailRedirectTo` = `{origin}/auth/callback?next=%2Fdashboard%2Fmy-invitations` | YES (as `next`) | signup/page.tsx:106 |
| 8. Supabase sends confirm email | Contains emailRedirectTo URL | YES | Supabase internal |
| 9. User clicks confirm link | Redirects to `/auth/callback?code=XXX&next=%2Fdashboard%2Fmy-invitations` | YES | Supabase internal |
| 10. Auth callback reads next | `next=/dashboard/my-invitations` (not `/dashboard`) | YES | callback/route.ts:25 |
| 11. Callback honors next | `next !== "/dashboard"` → skip getPostAuthRedirect → redirect to next | YES | callback/route.ts:96 |
| 12. Final redirect | `/dashboard/my-invitations` (intl middleware adds locale) | DELIVERED | — |

**Result:** User lands on `/dashboard/my-invitations` with pending invitation visible.

## Redirect Chain Trace — Existing User

| Step | URL/Action | File:Line |
|------|-----------|-----------|
| 1. Click email link | `/login?redirectTo=/dashboard/my-invitations` | — |
| 2. Login page reads redirectTo | `/dashboard/my-invitations` | login/page.tsx:48 |
| 3. User logs in | `router.push(redirectTo)` → `/dashboard/my-invitations` | login/page.tsx:107 |
| 4. Dashboard guard | User has ≥1 membership → pass through | layout.tsx |
| 5. Final | `/dashboard/my-invitations` | — |

## Invitation Matching

**File:** `src/app/[locale]/(dashboard)/dashboard/my-invitations/page.tsx:79`
**Query:** `.or(email.eq.${authUser.email},user_id.eq.${authUser.id})`
**Mechanism:** Matches by email address (from signup) OR user_id (if previously stamped)
**Status:** CORRECT — new user's email matches the invitation's email field

## Files Changed

| File | Change |
|------|--------|
| `src/app/[locale]/(dashboard)/dashboard/onboarding/group/page.tsx:598` | `?next=` → `?redirectTo=` in acceptUrl |
| `src/app/[locale]/(auth)/login/page.tsx:48` | Added `\|\| searchParams.get("next")` fallback |
| `src/app/[locale]/(auth)/signup/page.tsx:43` | Added `\|\| searchParams.get("next")` fallback |
| `CLAUDE.md` | Added rule #12: Invitation redirectTo chain |

## Known Risks

1. **Hardcoded domain**: All 4 acceptUrl sites hardcode `https://villageclaq.com`. Invitation emails from dev/staging environments link to production. LOW risk — only affects developer testing, not end users.

2. **Email-based matching only**: Invitations match by email, not by token. If a user signs up with a different email than the invitation was sent to, they won't see the invitation. This is by design but should be documented.

3. **Race condition**: If a user confirms their email before the invitation DB insert completes (very unlikely — invitation is inserted before email is sent), the auth callback's `getPostAuthRedirect()` would find 0 invitations and redirect to onboarding. The onboarding page has a "Join existing group" option as safety net.

## Verification Checklist

- [x] All 4 acceptUrl sites use `?redirectTo=` (not `?next=`)
- [x] Login page reads `redirectTo` (primary) and `next` (fallback)
- [x] Signup page reads `redirectTo` (primary) and `next` (fallback)
- [x] Login → Signup link preserves redirectTo
- [x] Signup → Login link preserves redirectTo
- [x] signUp() passes redirectTo as `?next=` in emailRedirectTo
- [x] Auth callback reads `next` and honors non-default values
- [x] Auth callback does NOT overwrite non-default `next` with getPostAuthRedirect()
- [x] Invitation email template uses caller-provided acceptUrl (passthrough)
- [x] My-invitations page matches by email
- [x] CLAUDE.md updated with rule #12
- [ ] Runtime verification pending (requires email confirmation flow test)
