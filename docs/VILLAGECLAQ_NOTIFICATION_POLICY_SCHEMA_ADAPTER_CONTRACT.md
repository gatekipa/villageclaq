# VillageClaq — Notification Policy Schema & Adapter Contract

**Track:** Product Consistency (Cut 2 / Phases 2–9 artifacts)  
**Authority:** `VILLAGECLAQ_PRODUCT_CONSISTENCY_AUTOMATION_REMEDIATION_PLAN.md`  
**Date:** 2026-09-10  
**Status:** Implementation-ready CREATE-NOT-APPLY artifacts — **no live wiring**

## Absolute boundaries

- CREATE-NOT-APPLY for `20260910120000_notification_policy_schema.sql`
- No cron / producer / queue rewiring in this cut
- No real WhatsApp / email / SMS sends
- Build-8 announcement queue path remains **DORMANT**
- **F3 ledger foundation untouched** (no F3 → main merge from this track)
- No Meta/WABA/template or Vercel env changes

## Architecture (reminder)

```
DOMAIN EVENT / OBLIGATION / ASSIGNMENT
  → NOTIFICATION POLICY          (schema + resolveEffectivePolicy)
  → DUE OCCURRENCE               (dormant table + occurrenceIdentity)
  → RESOLUTION / STOP CONDITION  (domain adapters)
  → MEMBER PREFERENCES
  → QUIET-HOUR EVALUATION        (foundation evaluator)
  → CHANNEL QUEUE
  → PROVIDER
  → DELIVERY EVIDENCE
```

Dispositions (foundation): `SEND_NOW` | `DEFER_UNTIL` | `STOP_RESOLVED` | `STOP_POLICY` | `SKIP_CHANNEL_DISABLED` | `INVALID_POLICY`

Quiet hours **defer** with the **same** occurrence identity — never mark sent solely because quiet hours blocked.

---

## Phase map (2–9) covered by this artifact set

| Phase | Deliverable | Location |
| --- | --- | --- |
| 2 | Schema CREATE-NOT-APPLY | `supabase/migrations/20260910120000_notification_policy_schema.sql` |
| 3 | Precedence resolution | `resolveEffectivePolicy` — `system_legacy < group_domain < object_override` |
| 4 | Channel intersection | `ChannelIntersection` = groupAllowed ∧ memberPref ∧ failClosedPrefs |
| 5 | Occurrence supersession | `OccurrenceSupersession` — future unsent → superseded; **sent immutable** |
| 6 | Payment adapter contract | `PaymentAdapter` — confirmed-full/waived resolved; partial/unpaid/pending unresolved |
| 7 | Hosting adapter contract | `HostingAdapter` — completed/exempt/cancelled/swapped-away resolve old host; new host = new object |
| 8 | Event adapter contract | `EventAdapter` — cancelled/completed resolved; starts_at reschedule = new anchor |
| 9 | Legacy parity + UI labels | `LEGACY_DEFAULTS`, `UI_POLICY_LABELS` (no RRULE jargon) |
| 10 | Pure contract tests | `scripts/test-notification-policy-contracts.mjs` (≥25) |

Foundation Phase 1 (evaluator / identity / quiet hours / defaults) remains in `src/lib/notification-policy.ts` (PR #68 hardening).

---

## Schema summary

### `notification_policies`

- Scoped by `(group_id, domain, object_id)` with `UNIQUE NULLS NOT DISTINCT`
- `object_id IS NULL` → group/domain default; non-null → object override
- Domains: `payment` | `hosting` | `event`
- Channels as boolean columns (no delivery/provider fields)
- Quiet pair check; repeat requires `max_occurrences`
- **No** delivery evidence columns here

### `notification_policy_triggers`

- `(policy_id, offset_hours)` unique
- Negative = before anchor; positive = after

### `notification_policy_occurrences` (**DORMANT**)

- `identity_key` must match pure `occurrenceIdentity()`:
  `domain:objectId:anchorIso:triggerOffsetHours:occurrenceIndex`
- Statuses: `scheduled|deferred|sent|skipped|superseded|cancelled|stop_resolved|stop_policy`
- No producers write yet — reserved for PC-PAYMENT → PC-HOSTING → PC-EVENTS adapters

### RLS & grants

- `ENABLE` + `FORCE ROW LEVEL SECURITY` on all three
- Uses existing `has_group_permission(group_id, perm_key)` (mirrors `usePermissions`)
- `REVOKE` from `PUBLIC`/`anon`; `GRANT` CRUD to `authenticated` (behind RLS) and `service_role`

---

## Permission choice: `settings.manage`

| Action | Gate |
| --- | --- |
| WRITE (INSERT/UPDATE/DELETE) | `has_group_permission(group_id, 'settings.manage')` |
| READ (SELECT) | same — officers with `settings.manage`, plus owner / general admin (helper semantics) |
| Ordinary members | no policy-table SELECT/WRITE |
| Future workers | `service_role` (RLS bypass) — separate from this cut |

**Do not invent `notifications.manage`.**  
`settings.manage` already exists in `ALL_PERMISSION_KEYS` / Roles UI and is the correct settings-surface key for group notification policy configuration.

Helper dependency: `public.has_group_permission` (migration `00072`). Also available: `is_group_member`, `is_group_admin` — used elsewhere; this schema prefers `has_group_permission` for officer gating.

---

## Precedence contract

```
system_legacy  <  group_domain  <  object_override
```

`resolveEffectivePolicy({ systemDefault, groupPolicy, objectPolicy })`:

1. Validate `systemDefault` (must be valid)
2. If `objectPolicy` present → validate; on failure **reject** (fail closed — no silent fallback)
3. Else if `groupPolicy` present → validate; on failure **reject**
4. Else return system default

Malformed partials must never become `SEND_NOW`.

---

## Channel intersection contract

```
effective[channel] = groupAllowed[channel]
                   AND memberPref[channel]
                   AND failClosedPrefs[channel]
```

Trust Cut 1 fail-closed map for real-user prefs **read error**:

- `in_app: true`
- `email/sms/whatsapp/push: false`

Exported as `FAIL_CLOSED_PREFS_ON_ERROR`. Proxy (`userId=null`) paths remain caller-owned (WhatsApp-only intentional path) and are not redefined here.

---

## Domain adapters

### Payment (`PaymentAdapter`)

| Economic status | Resolved? |
| --- | --- |
| `confirmed_full` | yes |
| `waived` | yes |
| `partial` | no |
| `unpaid` | no |
| `pending_confirmation` | no (economically unresolved) |

Optional `snoozeWhilePaymentPending: true` → sets `snoozeHint` only; does **not** loosely invent send suppression beyond documenting the hint for a future PC-PAYMENT producer.

Live cron honesty: `LEGACY_PAYMENT_CRON_CONTRACT` = overdue-daily selection, **not** a `+24h` relative trigger. `FUTURE_PAYMENT_POLICY` is `NOT_LIVE_WIRED_EXAMPLE`.

### Hosting (`HostingAdapter`)

- `completed` / `exempt` / `cancelled` / `swapped_away` → `resolvedForOldHost: true`
- Swap: new host uses **new object id** (new occurrence stream)
- Default parity: 7-day lead (`DEFAULT_HOSTING_POLICY`, offset `-7*24` hours)

### Event (`EventAdapter`)

- `cancelled` / `completed` → resolved
- `starts_at` change → `rescheduled_new_anchor` (not resolved); callers run `OccurrenceSupersession`
- Default parity: 48h lead (`DEFAULT_EVENT_POLICY`)

### Occurrence supersession

On anchor change:

- FUTURE unsent (`scheduled`, `deferred`) → mark `superseded`
- `sent` → **immutable** (keep)
- Other terminals (`cancelled`, `stop_*`, …) → leave as-is

---

## UI contract (labels only)

`UI_POLICY_LABELS` — human labels for domains, layers, fields, channels, permission copy.

- **No RRULE jargon** in UI strings
- Payment honesty string retained until PC-PAYMENT migrates
- Dormant occurrences called out in honesty copy

---

## Next domain order

1. **PC-PAYMENT** (first domain migration draft PR)
2. **PC-HOSTING**
3. **PC-EVENTS**

Separate draft PRs — no mega-PR. HOLD live cron rewiring until E2E qualified per domain.

## Announcement path

Remains **DORMANT** (`announcement-producer`, `00106`/`00107` cutover checklist). This policy schema does not activate announcement delivery modernization.

## F3

**Untouched.** Product Consistency must not merge or apply F3 ledger migrations as part of this track.

---

## Test harness

Local pure tests (no DB):

```bash
# from harness that includes foundation + contracts under src/lib
node --experimental-strip-types --test \
  scripts/test-notification-policy.mjs \
  scripts/test-notification-policy-contracts.mjs
```

See `NOTES.md` for recorded pass counts.

## File index

| Path | Role |
| --- | --- |
| `supabase/migrations/20260910120000_notification_policy_schema.sql` | CREATE-NOT-APPLY schema + RLS |
| `src/lib/notification-policy-contracts.ts` | Precedence, channels, supersession, adapters, UI labels |
| `scripts/test-notification-policy-contracts.mjs` | Pure contract matrix |
| `docs/VILLAGECLAQ_NOTIFICATION_POLICY_SCHEMA_ADAPTER_CONTRACT.md` | This document |
| `NOTES.md` | Harness results / counts |
