# QA Artifact Cleanup — 2026-06-12 (post-producerization program)

Masked ops note recording the controlled QA cleanup pass that followed the
12-producer WhatsApp reliability program (PRs #6–#15). All identifiers are
8-character prefixes; no phone numbers, secrets, or provider IDs appear in
this note by design.

## What was done

- **38 QA artifacts inventoried** (read-only first) across the three QA
  groups (`a3826fa1`, `21f4a0cd`, `f6d34aa2`), the QA org (`870f3c42`),
  and one throwaway auth user — covering memberships, contribution
  types/obligations, payments, fines, loans/installments, relief
  plans/enrollments/claims/remittances, invitations, hosting
  roster/assignment, join codes, subscription, and notification
  queue/webhook history.
- **15 rows updated + 1 throwaway auth user deleted**, all conclusively
  QA-only and guarded by full QA-scope predicates with exact
  affected-row-count verification:
  - waived: 2 past-due QA obligations, 1 QA fine
  - expired: 1 QA subscription (Stripe IDs confirmed NULL — no billing
    impact)
  - deactivated: QA contribution type, hosting roster, 2 relief plans,
    2 relief enrollments, join code, all 3 QA groups
  - restored: 1 QA membership standing (suspended → good, consistent
    with post-waiver recalculation)
  - hard-deleted: 1 auth-only test account (zero memberships, zero
    notifications, no phone; profiles row cascade-verified)
- **No messages sent** (WhatsApp/email/SMS), and queue counts were
  byte-identical before/after the pass (18 sent / 2 terminally failed /
  0 queued for QA groups).
- **No retries**: the 2 terminal failed queue rows (pre-WABA-fix
  remittance QA) were left untouched at `attempts=3`.
- **No migrations applied, no deploys, no Meta/provider/config changes.**
- **Queue/webhook/audit history left intact** — notification queue rows,
  webhook status events, in-app notifications, decided claims/remittances,
  terminal invitations, payments, and the settled QA loan all remain for
  audit history.

## Post-cleanup verification (all green)

0 pending/overdue QA obligations · 0 pending QA fines · 0 cron-pickable
hosting assignments · 0 active QA subscriptions · 0 pending invitations in
QA groups or matching the QA phone · 0 active QA relief enrollments ·
0 loan-overdue candidates · 0 pending remittances/claims · 3/3 QA groups
inactive.

## Production bug discovered during the pass

The inventory exposed a pre-existing **hosting-reminders cron bug**
(unrelated to QA data): the cron inserted in-app notifications with an
invalid `notification_type` enum value (`hosting_reminder`), so the insert
always failed, and its duplicate check compared an ISO date against a
locale-formatted body string, so it never matched — producing duplicate
daily WhatsApp/email reminders for any assignment inside the 7-day window.
At discovery time, 0 real assignments were in the window, so no real member
was affected. **Addressed by the legacy-cron producerization PR** (queue-
backed `hosting-reminder-producer`, valid enum usage, deterministic
`dedup_key`, migration `00097`).
