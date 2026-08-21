# Gemini QA "Welfare" Relief Plan — Cleanup Investigation (2026-08-20)

## Status: EXECUTED 2026-08-20 — plan + 5 enrollments deleted; sent queue rows preserved

Phase 0A of the stop-the-line cleanup identified the Gemini QA artifacts created
after PR #51. The investigation found the database state did **not** match the
QA report this task was written against: the 5 `notifications_queue` rows had
already been drained and **sent** with real provider message IDs, tripping the
task's own stop conditions. The destructive step was therefore held for review
rather than run blind.

The owner reviewed the findings below and approved a **narrowed** cleanup:
delete only the Welfare plan and its 5 enrollments; **preserve** the 5 sent
queue rows and the 13 WhatsApp status events as provider delivery history. That
narrowed transaction was executed on 2026-08-20 and verified — see
[Execution record](#execution-record-2026-08-20).

## What actually happened

Gemini QA created the artifacts on **2026-06-25 19:10 UTC**. The QA report
assumed the 5 `notifications_queue` rows stayed `queued` and no messages were
sent. In reality the queue drain cron picked them up ~4 minutes later
(**19:15 UTC**) and **sent all 5 WhatsApp messages** via the Meta Cloud API:

| Queue row id | Recipient | Member | Provider status |
|---|---|---|---|
| `843b9314-3bf4-481a-b32f-0078d9bf7458` | +1301***5857 | Jude Anyere | sent → **read** (19:24 UTC) |
| `00412485-ca20-41c2-a1b1-5f69539413fc` | +2376****1413 | Jude Anyere (owner membership) | sent → **read** (2026-07-11) |
| `2659b5ab-f063-4155-9db7-97f7b875584a` | +1301***5857 | Cyril Ndikum (proxy) | sent → **read** (19:24 UTC) |
| `cb5c3a1c-d80c-4b29-8c13-de1bf6adff69` | +1301***4432 | Ngoni Marie (proxy) | sent → **read** (2026-06-26) |
| `b1f732b5-88c6-4c8e-9d51-913bcd3d406f` | +2376****3456 | Test User (QA account) | sent → **failed** (131026 Message Undeliverable — fake number) |

All 5 rows have `status = 'sent'`, `sent_at = 2026-06-25 19:15 UTC`, and real
provider message IDs (`wamid.…`). 13 rows in
`whatsapp_message_status_events` record the delivery/read receipts for these
message IDs.

Counted precisely: the 5 messages went to **4 distinct phone numbers** (one
number, `+1301***5857`, received two — one for Jude Anyere's membership and one
for the Cyril Ndikum proxy, which is registered to the same contact number).
**4 messages were read**, across **3 distinct numbers**; the 5th (the QA test
number) failed undeliverable. So real recipients did see a
"villageclaq_plan_enrollment_confirmed" WhatsApp about the QA plan — but the
count of people is 3 numbers that read, not "four people".

There are currently **0 queued rows** in `notifications_queue` — nothing is
pending, so there is no send risk from leaving the artifacts in place.

## Identified artifacts (exact IDs)

**Relief plan** — exactly one plan named "Welfare" exists:

- `relief_plans.id = 9940bd3a-b0c3-4e27-9427-b74da00e9599`
- `created_at = 2026-06-25 19:10:10.7734+00`
- `created_by = bb01dadf-ba04-49df-9b15-ec917ccf8a41` — profile "Test User",
  phone `+2376****3456` (undeliverable test number), account created the same
  morning (2026-06-25 05:36 UTC). This uniquely ties the plan to the Gemini QA
  session.
- `group_id = b93cd45d-9b70-4559-8d46-dd438a1f47f8` ("MBACUDA", a **real
  production group**, organization `4812a11c-77ba-41ad-a1d6-f6e198240f07`)

**Relief enrollments** — exactly 5, all created 2026-06-25 19:10:11 UTC, all on
this plan:

| Enrollment id | Membership | Member |
|---|---|---|
| `2cd96b2a-c85f-43c6-bdf1-700076eb1dba` | `a9bc025a-2510-4813-bb1e-8b27420edee3` | Jude Anyere (real) |
| `e08aa3b4-3e3d-49fc-8e6c-8a33a496177b` | `ff87ce12-6952-4164-8396-30cc6ae35f61` | Jude Anyere, owner (real) |
| `63a7e820-1fa4-4f2e-8dd0-87a7e448913a` | `3a806a69-4095-4b06-9bd1-df97bc49a784` | Cyril Ndikum, proxy (real) |
| `6ff2253f-a7b5-42a8-91cc-1988e6457f13` | `ae9eeb6c-9b94-461c-b550-c48437a331fb` | Ngoni Marie, proxy (real) |
| `6e5a8de4-9b16-4dd3-a47a-a95f8c37f724` | `5abd37ab-deab-464b-828f-7454bffef59c` | Test User (QA account, group owner role) |

Note: the QA "Test User" holds an `owner` membership in the real MBACUDA
group — a separate access-hygiene issue worth addressing (see follow-ups).

**Dependency check (all zero — safe):** no `relief_claims`, no
`relief_payouts`, no `relief_remittances`, no `payments.relief_plan_id`
references, no in-app `notifications`, and no `group_audit_logs` rows reference
the plan or the 5 enrollments.

## Why the original cleanup plan cannot run as written

1. The 5 queue rows are `sent` with provider message IDs. Task rules forbid
   deleting sent rows, and deleting them would also orphan the
   `whatsapp_message_status_events` delivery history — they are now real
   provider audit records.
2. Queue counts can never return to the QA "before" snapshot (444/417/27/0):
   two months of production traffic ran since June; the live queue is
   1802 total / 1775 sent / 27 failed / 0 queued as of 2026-08-20.
3. Likewise `payments` is now 137 (QA snapshot said 124) from normal production
   use — unrelated to the QA artifacts (payments have no reference to the plan).

## Cleanup transaction (APPROVED AND EXECUTED 2026-08-20)

Deletes only the plan and its 5 enrollments, by exact ID. The 5 sent queue rows
and the webhook status events are retained as delivery history.

> **The block below is illustrative — it shows the intended scope only, and is
> NOT what ran.** It has no executable guards, and because
> `relief_enrollments.plan_id` is `ON DELETE CASCADE`, deleting the plan alone
> would silently remove enrollments without a row-count check. What actually
> executed was the guarded `DO` block described under
> [Execution record](#execution-record-2026-08-20), which raises and rolls back
> on any unexpected row count. Re-run that, not this.

```sql
BEGIN;

-- 1) The 5 accidental enrollments (exact IDs)
DELETE FROM relief_enrollments
WHERE id IN (
  '2cd96b2a-c85f-43c6-bdf1-700076eb1dba',
  'e08aa3b4-3e3d-49fc-8e6c-8a33a496177b',
  '63a7e820-1fa4-4f2e-8dd0-87a7e448913a',
  '6ff2253f-a7b5-42a8-91cc-1988e6457f13',
  '6e5a8de4-9b16-4dd3-a47a-a95f8c37f724'
)
AND plan_id = '9940bd3a-b0c3-4e27-9427-b74da00e9599';
-- expect: DELETE 5

-- 2) The accidental "Welfare" plan (exact ID)
DELETE FROM relief_plans
WHERE id = '9940bd3a-b0c3-4e27-9427-b74da00e9599'
AND name = 'Welfare'
AND created_by = 'bb01dadf-ba04-49df-9b15-ec917ccf8a41';
-- expect: DELETE 1

-- Verify before COMMIT:
--   SELECT count(*) FROM relief_plans;        -- expect 2
--   SELECT count(*) FROM relief_enrollments;  -- expect 2
--   SELECT count(*) FROM relief_remittances;  -- expect 4 (untouched)
-- If any count differs, ROLLBACK.

COMMIT;
```

Intentionally **not** included (explicitly not approved):
- Deleting the 5 sent `notifications_queue` rows (forbidden: sent + provider IDs).
- Deleting the 13 `whatsapp_message_status_events` webhook rows.
- Removing the QA "Test User" profile/membership (`bb01dadf-…` /
  `5abd37ab-…`) — recommended follow-up, since it holds an owner role in the
  real MBACUDA group, but it is out of Phase 0A scope.

## Execution record (2026-08-20)

The transaction ran as a single guarded `DO` block (any failed guard raises and
rolls the whole block back). Pre-flight guards verified before deleting:
exactly one plan named "Welfare"; target plan matched name + QA creator; zero
claim/remittance/payment dependencies; the 5 QA queue rows present as `sent`
with provider message IDs; and zero rows in `queued` state. Foreign keys were
checked first — `payments` and `relief_remittances` reference `relief_plans`
with `NO ACTION` (they block rather than cascade, and none referenced this
plan), and nothing references `relief_enrollments` at all.

**Rows deleted (6 total):**

| Table | Rows | IDs |
|---|---|---|
| `relief_enrollments` | 5 | `2cd96b2a-…`, `e08aa3b4-…`, `63a7e820-…`, `6ff2253f-…`, `6e5a8de4-…` |
| `relief_plans` | 1 | `9940bd3a-b0c3-4e27-9427-b74da00e9599` ("Welfare") |

**Verified before → after:**

| Metric | Before | After | Result |
|---|---|---|---|
| relief_plans | 3 | **2** | ✅ target |
| relief_enrollments | 7 | **2** | ✅ target |
| relief_remittances | 4 | 4 | ✅ untouched |
| relief_claims | 2 | 2 | ✅ untouched |
| payments | 137 | 137 | ✅ untouched |
| notifications | 136 | 136 | ✅ untouched |
| announcements / deliveries | 16 / 0 | 16 / 0 | ✅ untouched |
| queue total / sent / failed / queued | 1802 / 1775 / 27 / 0 | 1802 / 1775 / 27 / 0 | ✅ untouched |
| reminder queued / receipt queued | 0 / 0 | 0 / 0 | ✅ untouched |
| whatsapp_message_status_events | 2885 | 2885 | ✅ provider history preserved |
| The 5 QA queue rows | 5 | 5 | ✅ preserved (sent + provider IDs) |

## Confirmations

Scoped precisely, so the June sends are not confused with this cleanup:

- **The cleanup sent nothing.** Investigation and verification were read-only;
  the cleanup itself was DELETE-only against two tables. The 5 WhatsApp
  messages recorded above were sent by the drain cron on **2026-06-25**,
  months before this work, and are preserved as history — not re-sent.
- No queue drain was run, no failed rows retried, no reminders or receipts
  triggered.
- **Exactly 6 rows were deleted** — the 5 QA `relief_enrollments` and the 1 QA
  `relief_plans` row listed above. No `notifications_queue` row, no
  `whatsapp_message_status_events` row, no payment, remittance, claim, audit
  log, or any other production row was deleted or modified.
- No migrations applied during 0A. No env/provider/payment config changed.
