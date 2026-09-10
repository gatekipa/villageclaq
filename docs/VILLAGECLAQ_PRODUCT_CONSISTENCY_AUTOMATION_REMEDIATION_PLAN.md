# VillageClaq — Product Consistency & Automation Remediation Plan

**Authority:** Product Consistency track (separate from F3 ledger integration)  
**Base:** `main` @ `ba479fb510343c37cdfa888f6e94aeb7ab07292f`  
**F3 checkpoint:** F3-01…F3-05 COMPLETE AND FROZEN on `codex/f3-core-ledger-foundation` @ `c7b4cd535d7125737eab2ec0fad27cae9432e8c3` (migrations unapplied). F3-06 READY / NOT STARTED.  
**Date:** 2026-09-10

## Absolute boundaries

- No main merge without founder review
- No production migration apply / deploy
- No real WhatsApp/email/SMS sends
- No Build-8 announcement live activation
- No F3 → main merge in this track
- No Meta/WABA/template or Vercel env changes


## Status update — 2026-09-10 (Trust Cut 1 released + policy foundation refresh)

**main:** `0559b758bc53df3ec8081e361ffd022c1f19be43` (PR #67 Trust Cut 1 MERGED)

| Artifact | State | Tip |
| --- | --- | --- |
| PR #67 Trust Cut 1 | **MERGED to main** | head `3160678a…` → merge `0559b758…` |
| PR #68 foundation (stale base) | **SUPERSEDED** — do not merge | historical `5feb995c…` |
| PR #69 foundation v2 | **DRAFT** on current main | `a8cdeaa9…` (34/34) |
| Schema / adapter contract PR | see latest security/* draft | CREATE-NOT-APPLY |
| Announcements | **DORMANT** | 00106/00107 unapplied |
| F3-06 | READY / NOT STARTED | F3 tip `c7b4cd53…` |

### Domain order (next)
1. **PC-PAYMENT** — READY FOR BOUNDED IMPLEMENTATION (live cron HOLD)
2. **PC-HOSTING**
3. **PC-EVENTS**

Permission for policy admin: existing **`settings.manage`** (do not invent `notifications.manage`).


## Unified notification policy architecture

```
DOMAIN EVENT / OBLIGATION / ASSIGNMENT
  → NOTIFICATION POLICY
  → DUE OCCURRENCE
  → RESOLUTION / STOP CONDITION
  → MEMBER PREFERENCES
  → QUIET-HOUR EVALUATION
  → CHANNEL QUEUE
  → PROVIDER
  → DELIVERY EVIDENCE
```

**Dispositions:** `SEND_NOW` | `DEFER_UNTIL <ts>` | `STOP_RESOLVED` | `STOP_POLICY` | `SKIP_CHANNEL_DISABLED`

Quiet hours must **defer**, never mark one-shot reminders as sent when blocked.

Do not let payment/hosting/event crons each own forever-diverging business scheduling.

### Policy capabilities (target)

enabled, timezone, relative triggers (before/after anchor), multiple offsets, repeat interval, max occurrence count, stop_when_resolved, stop_after, quiet-hour defer, channel allow-list, group default, domain override, object override.

**Anchors:** payment due date · hosting assigned date · event `starts_at`

### Backwards-compatible defaults (must preserve)

| Domain | Current effective default |
| --- | --- |
| Payment | Overdue daily reminder behavior as live today |
| Hosting | ~7-day lead (`+7 * 86400000` in hosting cron) |
| Events | ~48-hour lead (event reminder producer/cron) |

No surprise fan-out: existing groups keep current semantics until an admin changes policy.

---

## A. Financial report taxonomy

### Current contribution-centric Reports Hub (ids preserved)

| ID | Current name | Classification |
| --- | --- | --- |
| 1 | Who Hasn't Paid | CONTRIBUTION/DUES |
| 2 | Annual Financial Summary | CONTRIBUTION/DUES (mislabelled as org-wide finance) |
| 3 | Contribution Ledger | CONTRIBUTION/DUES |
| 4 | AR Aging | CONTRIBUTION/DUES (dues AR) |
| 5 | Njangi Cycle Report | NJANGI |
| 21–23 | Loan reports | LOAN |
| 24 | Federated Relief | RELIEF |

Also audit: dashboard financial cards (`totalCollected` / `collectionRate` / `outstanding`), Board Packet (report 16), Meeting Pack, AI Insights payload, CSV/PDF exports, subscription tier catalog.

**Target:** Contributions & Dues remain specialized. General organization finance later from F3 projections — **do not wire F3 into main until authorized**.

**Release mapping:** Trust Cut 1 = label honesty only · F3-dependent = true org finance reports after F3 production cut.

---

## B. Payment reminders

**Today:** `payment-reminder-producer` + `api/cron/payment-reminders`; confirmed-basis stop; waived stop; idempotency migration `00090`; `payment_reminder_rules` existence must be verified as live-wired vs dormant.

**Target:** Group-configurable cadence (first/pre-due/post-due offsets, repeat, max count, stop-after, stop-when-resolved, optional pending snooze, severity, channels). Fully confirmed paid → STOP. Waived → STOP. No duplicates.

**Release mapping:** Policy foundation cut → PC-PAYMENT domain migration.

---

## C. Hosting reminders

**Today:** Hard-coded 7-day selection in `api/cron/hosting-reminders` (`in7days = now + 7d`).

**Target:** Roster/group-configurable offsets (30/14/7/3/2/1/day-of). Default remains 7 days for compatibility.

**Release mapping:** Policy foundation → PC-HOSTING.

---

## D. Event / meeting reminders

**Today:** `event-reminder-producer` + `api/cron/event-reminders` + `00066_event_reminder_sent_at` — effective ~48h hard-code.

**Target:** Configurable 14d/7d/48h/24h/2h with group defaults, event override, reschedule recompute, cancel/complete stop, per-occurrence idempotency.

**Release mapping:** Policy foundation → PC-EVENTS.

---

## E. Notification preferences / quiet hours

**Today (`src/lib/notification-prefs.ts`):**

- Preference-read errors historically **fail-OPEN** — **Trust Cut 1 (#67) flips real-user error to fail-CLOSED** (proxy WhatsApp-only preserved).
- Proxy (`userId=null`) intentionally WhatsApp-only path — preserve.
- Quiet hours: stored in prefs model / settings UI (verify) but **not enforced** in producers — **P1**.

**Target:** Real-user preference-read error → fail-CLOSED external (`in_app` only). Quiet hours → `DEFER_UNTIL` when scheduler supports; never mark sent solely because quiet hours blocked.

**Release mapping:** Trust Cut 1 = fail-closed · Policy cut = quiet-hours evaluator · HOLD live cron wiring until defer works.

---

## F. Announcements

**Live:** Manual / scheduled announcement paths; communications UI already notes best-effort / not delivery-confirmed for some channels.

**Dormant:** `announcement-producer.ts`, delivery status mapping/rollup, migrations `00106`/`00107`, queue drain, webhook — **MUST REMAIN DORMANT**.

**Target statuses:** in_app_published, queued, sent_to_provider, delivered, read, failed, blocked_by_policy, unavailable, skipped_no_recipient, skipped_channel_disabled. Never call `sent_to_provider` "delivered".

### Future atomic cutover checklist (NOT tonight)

1. Apply `00106`  
2. Apply `00107`  
3. Wire producer  
4. Drain support  
5. Webhook support  
6. Remove direct-dispatch  
7. History UI evidence rollup  
8. US WhatsApp Marketing policy behavior  
9. Performance batching  
10. Rollback plan  

Activation remains **HOLD**.

---

## Release cuts

### Cut 1 — Trust & Honesty (branch `product-consistency/trust-cut-1-20260910`)

- Fail-closed external prefs on read error (real users)
- Contributions & Dues labelling for Reports 1–4 / financial category copy
- No false Delivered claims without evidence (copy audit; no producer activation)

### Cut 2 — Notification policy foundation

- Shared schema (CREATE-NOT-APPLY if needed) + pure evaluator + occurrence identity + stop/quiet-hour contracts + defaults
- HOLD live cron rewiring until E2E qualified

### Later domain tickets

- PC-PAYMENT · PC-HOSTING · PC-EVENTS (separate draft PRs; no mega-PR)
- Announcement modernization preparation only

---


## Confirmed notification-policy contract gaps (2026-09-10 review)

Do not rewrite the architecture above. These gaps must be closed in the pure foundation (**PR #68**) before any domain cron migration.

### PC-NP1 — Occurrence identity must include anchor identity/time (P0 contract)

**Current (insufficient):** `domain + object + trigger offset + occurrence index`

**Why:** If the same event/hosting assignment/due date is rescheduled, a new reminder can collide with the old occurrence identity.

**Target:** Include canonical **anchor timestamp** (or equivalent immutable schedule-generation discriminator):

`domain + object_id + anchor_timestamp + trigger_offset + occurrence_index`

Reschedule → distinct identity. Unchanged schedule retries → same identity (dedupe). Quiet-hour defer retains the **same** occurrence identity (defer ≠ new occurrence).

### PC-NP2 — API surface must not imply unimplemented schedule math (P0 contract)

The config declares `triggers`, `repeatIntervalHours`, `stopAfterHours`, but a pure evaluator that only checks enabled/resolved/channel/quiet hours does **not** generate the schedule those fields describe.

**Target split:**

- `generateScheduledOccurrences(...)` — relative triggers, repeat cadence, max occurrences, stop-after horizon
- `evaluateDisposition(...)` — SEND_NOW / DEFER_UNTIL / STOP_* / SKIP_CHANNEL / INVALID_POLICY

Do not permit the public API to imply behavior the engine does not implement. Live cron wiring remains **HOLD** until this contract is qualified.

### PC-NP3 — Timezone / quiet-hour validation fail-closed (P1 contract)

Invalid IANA timezone must not crash a producer and must not accidentally `SEND_NOW`.

Quiet hours → **`DEFER_UNTIL`** (never mark occurrence sent).

Malformed quiet minutes / channels / non-finite offsets / zero-or-negative repeat / invalid max → controlled `INVALID_POLICY` (or validation failure) before delivery evaluation.

### Payment compatibility note (evidence)

Live `api/cron/payment-reminders` selects obligations with `due_date < today` (overdue daily candidacy) with per-obligation-per-UTC-day WhatsApp idempotency — **not** an exact `+24h` relative trigger. Do not encode a false `+24h` live default in the foundation; document legacy overdue-daily separately from future policy templates.

### Announcements

Remain **DORMANT**. Checklist in section F unchanged. Do not apply `00106`/`00107`.


## Gap inventory (severity × cut)

| ID | Area | Sev | Cut |
| --- | --- | --- | --- |
| PC-NP1 | Occurrence identity missing anchor timestamp | P0 | FIX IN POLICY FOUNDATION (#68) |
| PC-NP2 | Config fields without schedule generation | P0 | FIX IN POLICY FOUNDATION (#68) |
| PC-NP3 | Timezone/quiet-hour validation fail-closed | P1 | FIX IN POLICY FOUNDATION (#68) |
| PC-E1 | Prefs fail-open on error | P1 | FIX IN TRUST CUT 1 |
| PC-A1 | Report 2 titled as org-wide finance | P1 | FIX IN TRUST CUT 1 |
| PC-A2 | Financial category label implies full ledger | P2 | FIX IN TRUST CUT 1 |
| PC-E2 | Quiet hours not enforced | P1 | NEXT CUT (evaluator) / HOLD cron wire |
| PC-C1 | Hosting hard-coded 7d | P2 | NEXT CUT / PC-HOSTING |
| PC-D1 | Event hard-coded ~48h | P2 | NEXT CUT / PC-EVENTS |
| PC-B1 | Payment cadence not group-configurable | P2 | NEXT CUT / PC-PAYMENT |
| PC-A3 | Dashboard/Board Packet/AI use contribution metrics as org finance | P2 | F3-DEPENDENT |
| PC-F1 | Announcement queue cutover incomplete | P2 | FUTURE (prep only) |
| PC-HYG | Historical migration 00015/00046 | P3 | FUTURE |
| PC-F3 | F3-01 assert_finances_manage EXECUTE | P3 | FUTURE |

---

## Future module audit intake

For each of Njangi, Relief, Elections, Loans, Projects, Fines, Standing, Membership, Meeting Minutes, Hosting — use:

CURRENT BEHAVIOR · HARD-CODED ASSUMPTIONS · DATA SOURCE · STOP CONDITION · NOTIFICATION POLICY · REPORTING MODEL · TENANT SECURITY · IDEMPOTENCY · UI CONFIGURABILITY · WHAT IS MISSING · RELEASE CUT

Do not speculate before auditing.

---

## Production

UNCHANGED. No migration apply. No main merge. No real sends.
