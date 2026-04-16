# VillageClaq - Development Conventions

## Project Overview
Multi-tenant SaaS platform for African community groups (njangis, alumni unions, village associations, church groups). One account, many groups model.

**Owner**: Jude Anyere, LawTekno LLC
**First Client**: Cyril Ndikum
**Deployment**: Vercel (auto-deploys from `origin/main`)

## Tech Stack
- **Framework**: Next.js 15 (App Router, TypeScript, `src/` directory)
- **Database/Auth/Storage**: Supabase (PostgreSQL + Auth + RLS + Realtime + Storage)
- **Supabase Project URL**: `https://llbnliixczcqfftxpsmb.supabase.co`
- **Styling**: TailwindCSS v4 + shadcn/ui (emerald/slate theme)
- **i18n**: next-intl (EN/FR bilingual, every string through `t()`)
- **Data Fetching**: TanStack Query v5
- **Charts**: Recharts
- **PDF Export**: jsPDF + jspdf-autotable via `exportPDF()` from `@/lib/export-pdf.ts`
- **AI Insights**: POST `/api/ai-insights` with `{ reportType, reportData }`, uses `claude-haiku-4-5-20251001`
- **Hosting**: Vercel
- **Icons**: Lucide React

## Critical Rules

### 1. ZERO Hardcoded Strings
Every UI-facing string MUST use `next-intl` translation keys via `t()` or `useTranslations()`. Add keys to both `messages/en.json` and `messages/fr.json` before using them. No exceptions. Use the `locale` variable or `t()` function — never hardcode English strings.

### 2. Single Auth Source of Truth
Supabase Auth + Next.js middleware (`src/middleware.ts`). No duplicate auth checks. Use `createClient()` from `@/lib/supabase/server` or `@/lib/supabase/client`.

### 3. Dark Mode from Day 1
Use Tailwind `dark:` variant + CSS variables defined in `globals.css`. Theme toggle uses `next-themes`. All new components must look correct in both light and dark modes.

### 4. Mobile-First
Design for 375px width first. Sidebar collapses to hamburger on mobile. Use responsive Tailwind classes (`sm:`, `md:`, `lg:`).

### 5. ALWAYS Use getMemberName() for Name Resolution
**CRITICAL**: Proxy members have `user_id = NULL`, `is_proxy = true`, and their name is stored in `memberships.display_name` — NOT `profiles.display_name` (which doesn't exist for them). **ALWAYS** use `getMemberName()` from `@/lib/get-member-name.ts` for name resolution. Never access `profiles.full_name` or `profiles.display_name` directly.

### 6. ALWAYS Use formatAmount() for Money
**CRITICAL**: Use `formatAmount()` from `@/lib/currencies.ts` for ALL money formatting. Never use raw `Intl.NumberFormat`, `toLocaleString()`, or hardcoded `$`. The function handles XAF/XOF (no decimals, "FCFA" suffix) and all other currencies correctly.

### 7. Permission System
Use `usePermissions()` hook which checks `position_permissions` table. Owner/Admin bypass all checks. Use `<PermissionGate permission="...">` component to wrap action buttons. Use `<RequirePermission>` for page-level gates.

### 8. Standing Auto-Calculation
Standing is auto-calculated via `calculateStanding()` from `@/lib/calculate-standing.ts`. Four rules:
1. **Dues**: any overdue `contribution_obligation` → FAIL
2. **Attendance**: below 60% in last 12 months → FAIL
3. **Relief**: behind on any enrolled relief plan → FAIL
4. **Disputes**: open disputes → soft FAIL (warning only)

Scoring: all pass → `good`, 1 non-dues fail → `warning`, dues fail or 2+ fails → `suspended`.
Use `useMemberStanding()` hook from `@/lib/hooks/use-member-standing.ts` (caches 5 minutes).

### 9. Dependency Array Safety (CRITICAL — Production Incident)
An infinite loop bug (331 requests/min) was caused by putting `useSearchParams()` in a `useCallback` dependency array. These rules prevent recurrence:

- **NEVER** put `useSearchParams()` result in deps — it returns a new object every render. Extract the specific param as a string: `const val = searchParams.get("key")` and use `val` in deps. Or use `useStableSearchParams()` / `useSearchParam(name)` from `@/lib/hooks/use-stable-search-params.ts`.
- **NEVER** put `router` from `useRouter()` in deps — it may return a new object every render. Use the `routerRef` pattern: `const routerRef = useRef(router); routerRef.current = router;` then call `routerRef.current.push(...)` inside effects. Or use `useStableRouter()` from `@/lib/hooks/use-stable-router.ts`.
- **NEVER** put raw objects/arrays in deps — extract primitives or wrap in `useMemo`.
- **ALWAYS** wrap fetch functions in `useCallback` with `[]` (empty) deps when they read dynamic values through refs.
- **ALWAYS** add cooldown guards to user/auth fetch functions (see `lastFetchTime` ref pattern in `group-context.tsx`).

See `src/UNSTABLE_DEPS_AUDIT.md` for the full audit.

### 10. Onboarding Redirect Enforcement (CRITICAL — Production Incident)
A recurring bug caused 0-membership users to land on a stateless dashboard instead of onboarding. These rules prevent recurrence:

- **ALL** membership-based post-auth redirects MUST use `getPostAuthRedirect()` from `src/lib/auth-redirect.ts`. No inline `if (memberships.length === 0) redirect(...)` logic.
- **Auth callback** (`src/app/auth/callback/route.ts` and `src/app/[locale]/(auth)/callback/route.ts`) performs the EARLIEST redirect decision server-side. Both callbacks must stay in sync.
- **Dashboard layout** (`src/app/[locale]/(dashboard)/layout.tsx`) is the BLOCKING enforcement layer. No dashboard UI renders before membership status is resolved.
- **0-membership users** must NEVER see any dashboard content. The guard shows a full-page spinner until redirect completes.
- **Onboarding route** (`/dashboard/onboarding/*`) is exempt from 0-membership redirect-away logic via `isZeroMembershipAllowedPath()`.
- **Redirect lock** (`src/lib/redirect-lock.ts`) prevents duplicate redirects from racing.
- **NEVER** add redirect logic in individual dashboard pages. All redirect decisions flow through layout guard or auth callback.

See `src/ONBOARDING_REDIRECT_AUDIT.md` for the full audit.

### 11. Notification Channel Routing (CRITICAL — Compliance/Cost)
Africa's Talking charges for SMS attempts even when they fail. SMS to US/UK/EU numbers fails 100% of the time. These rules prevent wasted spend:

- **SMS (Africa's Talking)**: ONLY sent to African phone numbers. Use `isAfricanPhoneNumber()` from `src/lib/is-african-phone.ts`. If country detection fails, SMS is SKIPPED (fail-safe).
- **WhatsApp (Meta Cloud API)**: Sent to ALL valid phone numbers globally (African + diaspora). Use `isWhatsAppEligible()` / `formatPhoneForWhatsApp()` from `src/lib/format-phone-whatsapp.ts`.
- **Email (Resend)**: Sent to all users with email addresses. No country restrictions.
- **In-App**: Sent to all users. Cannot be opted out.
- **Channel selection**: Always happens BEFORE any API call via `getEnabledChannels()` from `src/lib/notification-prefs.ts`. Caller's `channels` param is an upper bound; member preferences further restrict.
- **NEVER** send SMS without checking `isAfricanPhoneNumber()` first — including in queue drain workers.
- **NEVER** add empty `catch {}` blocks in notification code. Always log the error with `console.warn("[Channel] context:", err)`.
- **Queue drain** (`src/app/api/cron/drain-notification-queue/route.ts`) must re-validate `isAfricanPhoneNumber()` before retrying queued SMS.

See `src/NOTIFICATION_CHANNEL_AUDIT.md` for the full audit.

### 12. Invitation redirectTo Chain (CRITICAL — User Acquisition)
New users invited by admins must be able to create an account and land on `/dashboard/my-invitations`. The `redirectTo` parameter must survive the entire chain: email link → login → signup → email confirm → auth callback → final redirect.

- **Invitation email URL** must use `?redirectTo=/dashboard/my-invitations` (NOT `?next=`). The login page reads `redirectTo`.
- **Login page** reads `redirectTo` from URL, preserves it in the "Sign up" link.
- **Signup page** reads `redirectTo` from URL, embeds it as `?next=` in `emailRedirectTo` for the Supabase confirmation email.
- **Auth callback** reads `next` from URL. If `next !== "/dashboard"`, honors it directly (skips `getPostAuthRedirect()`).
- **NEVER** use `?next=` in invitation email URLs — login/signup pages read `?redirectTo=`. The `?next=` param is only for the auth callback.
- **Both login and signup** pages accept `next` as a fallback for `redirectTo` (defense in depth).

See `src/INVITATION_REDIRECT_AUDIT.md` for the full audit.

## Directory Structure
```
src/
├── app/[locale]/
│   ├── (auth)/          # Login, signup, offline (unprotected)
│   ├── (dashboard)/     # Dashboard routes (protected by middleware)
│   ├── about/           # Public about page
│   ├── contact/         # Public contact page
│   ├── pricing/         # Public pricing page
│   ├── privacy/         # Public privacy policy
│   ├── terms/           # Public terms of service
│   ├── verify/[code]/   # QR code membership verification (public)
│   ├── page.tsx         # Public landing page
│   └── layout.tsx       # Root locale layout with providers
├── components/
│   ├── layout/          # Sidebar, Header, GroupSwitcher, PublicNavbar, PublicFooter
│   └── ui/              # shadcn/ui components + custom (PermissionGate, PhoneInput, etc.)
├── i18n/
│   ├── request.ts       # Server-side i18n config
│   └── routing.ts       # Locale routing + navigation helpers
├── lib/
│   ├── supabase/        # client.ts, server.ts, middleware.ts
│   ├── hooks/           # use-supabase-query.ts, use-member-standing.ts, use-permissions.ts
│   ├── calculate-standing.ts  # Auto-standing calculation (4 rules)
│   ├── currencies.ts    # formatAmount() + currency definitions
│   ├── get-member-name.ts     # getMemberName() — handles proxy members
│   ├── export.ts        # CSV export
│   ├── export-pdf.ts    # PDF export (jsPDF + autoTable)
│   ├── group-context.tsx # GroupProvider, useGroup() hook
│   ├── providers.tsx    # QueryClient + ThemeProvider + TooltipProvider
│   └── utils.ts         # cn() helper from shadcn
├── middleware.ts        # Combined Supabase auth + next-intl middleware
messages/
├── en.json              # English translations
├── fr.json              # French translations
supabase/
├── migrations/          # SQL migration files (version controlled, run manually in SQL Editor)
└── seed.sql             # Test data
```

## Supabase Storage Buckets
- **receipts**: public, 5MB max file size, RLS policies enabled
- **avatars**: public, 2MB max file size, RLS policies enabled
- **group-documents**: public, 10MB max file size, RLS policies enabled

## Database Conventions
- All tables use UUID primary keys
- All tables have `created_at` and `updated_at` (TIMESTAMPTZ, auto-managed)
- RLS enabled on every table
- RLS helper: `get_user_group_ids()` SECURITY DEFINER function avoids recursion in RLS policies
- Memberships table is the core junction: user_id + group_id + role + standing
- Enum types: `membership_role` (owner/admin/moderator/member), `membership_standing` (good/warning/suspended/banned), `invitation_status`, `notification_type`, `obligation_status` (pending/partial/paid/overdue/waived)
- SQL migrations go in `supabase/migrations/` for version control but are run manually in Supabase SQL Editor

### Key Tables
| Table | Purpose |
|-------|---------|
| `profiles` | User accounts (from Supabase Auth) |
| `groups` | Community groups |
| `memberships` | User ↔ Group junction (role, standing, display_name, is_proxy) |
| `group_positions` | Officer positions (President, Treasurer, etc.) |
| `position_assignments` | Who holds which position |
| `position_permissions` | What each position can do |
| `contribution_types` | Dues/levy definitions (amount, frequency) |
| `contribution_obligations` | What each member owes (amount, amount_paid, status, due_date, period_label) |
| `payments` | Recorded payments |
| `events` | Meetings, socials, fundraisers |
| `event_attendances` | Attendance records per member per event |
| `hosting_rosters` | Hosting rotation rosters |
| `hosting_assignments` | Individual hosting assignments (upcoming/completed/missed) |
| `meeting_minutes` | Rich text minutes with status (draft/published) |
| `elections` | Officer elections |
| `election_candidates` | Candidates per election |
| `election_votes` | Anonymous ballots |
| `relief_plans` | Mutual aid fund definitions |
| `relief_enrollments` | Member enrollment in relief plans |
| `relief_claims` | Claims against relief plans |
| `disputes` | Filed disputes between members |
| `notifications` | In-app notifications |
| `announcements` | Group-wide announcements |
| `documents` | Uploaded group documents |
| `committees` | Sub-groups/committees |
| `committee_members` | Committee membership |
| `sub_group_transfers` | Member transfers between sub-groups |
| `savings_cycles` | Rotating savings (njangi/ajo/susu) cycles |
| `savings_contributions` | Individual contributions to savings cycles |
| `activity_feed` | Timeline of group activity |
| `feed_reactions` | Emoji reactions on feed items |
| `fines` | Fines issued to members |
| `fine_rules` | Auto-fine rules |
| `family_members` | Member family registry |

### Key RPC Functions
- `create_proxy_member(p_group_id, p_display_name, p_phone, p_role)` → returns new membership UUID. Creates a membership with `user_id = NULL`, `is_proxy = true`.
- `verify_membership(p_membership_id)` → returns limited public data for QR verification.
- `get_user_group_ids()` → SECURITY DEFINER helper for RLS policies.

### Proxy Members
Proxy members represent people without smartphones/accounts (elderly members, non-tech users). They:
- Have `user_id = NULL` and `is_proxy = true` on the `memberships` table
- Store their name in `memberships.display_name`
- Store phone in `memberships.privacy_settings.proxy_phone`
- Are managed by `proxy_manager_id` (the admin who created them)
- Get auto-enrolled in active contribution types when created
- Show a "Proxy Member" badge in the UI

## Component Conventions
- Use shadcn/ui components from `@/components/ui/`
- Client components must have `"use client"` directive
- Import navigation from `@/i18n/routing` (Link, useRouter, usePathname, redirect)
- Use `useTranslations()` hook in client components, `useTranslations()` import from `next-intl` in server components

## Supabase Client Usage
- **Server Components / Server Actions**: `import { createClient } from '@/lib/supabase/server'`
- **Client Components**: `import { createClient } from '@/lib/supabase/client'`
- Never import server client in client components or vice versa

## Multi-Tenancy Model
- Users sign up once (Supabase Auth → profiles table)
- `memberships` table links users to groups (many-to-many)
- Each membership has its own role, standing, display_name, privacy settings
- Group Switcher reads from memberships to show all user's groups
- `useGroup()` hook provides: `groupId`, `currentGroup`, `currentMembership`, `user`, `isAdmin`
- Position-based permissions (group_positions → position_permissions)

## Git Workflow
- Push to `origin/main` — Vercel auto-deploys
- Commit messages follow conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`
- Co-authored commits with Claude include the `Co-Authored-By` trailer
