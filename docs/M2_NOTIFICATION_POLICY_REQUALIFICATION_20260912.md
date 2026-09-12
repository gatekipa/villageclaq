# PLANNING — M2 notification policy foundation requalification (post-S0)

**Date:** 2026-09-12  
**Status:** PLANNING + EVIDENCE ONLY  
**Overall verdict:** **PASS — M2 REQUALIFICATION COMPLETE; READY FOR FOUNDER M2 IMPLEMENTATION DECISION**  
**This PR:** docs / evidence only. **DO NOT MERGE IMPLEMENTATION. DO NOT APPLY MIGRATION.**  
**Production mutation:** SELECT-only inventory. **ZERO** DDL, **ZERO** queue INSERT, **ZERO** sends, **ZERO** provider calls, **ZERO** env changes.

---

## Pins (do not drift)

| Pin | Value |
|-----|-------|
| Current main | `0c147f8e1e7aadbfd14583f6a9bef465c2217fe1` |
| Production migrations | **31** |
| Cut 1 | `20260911183755` / `s0_p0a_cut1_active_authorization` (LIVE) |
| Cut 2 | `20260912033612` / `s0_p0b_cut2_notification_queue` (LIVE) |
| Cut 3 | `20260912134123` / `s0_p0c_cut3_storage_path_fail_closed` (LIVE) |
| S0 | **COMPLETE** (Cut1+Cut2+Cut3 CLOSED) |
| Live project | `llbnliixczcqfftxpsmb` |
| Generic relays | **410** (`/api/sms/send`, `/api/whatsapp/send`, `/api/email/send`) |
| Policy tables in prod | **ABSENT** (`to_regclass` NULL ×3) |
| `enqueue_outbound_notification` | **EXISTS** (SECURITY DEFINER, `search_path=''`, EXECUTE `service_role` only) |
| Policy engine on main | **ABSENT** (`src/lib/notification-policy.ts` / `notification-policy-contracts.ts` 404) |
| Forward SQL sequence | ends at **00116** — future M2 file **`00117_*`** (DO NOT create in this PR) |
| PR #69 | OPEN DRAFT `a8cdeaa98e6bb9e3a6cccaf815aa4ae4441b59a7` — **DO NOT MERGE** |
| PR #70 | OPEN DRAFT `0f258726c9328ee0204f7b5dee9efceebe7265b9` — **DO NOT MERGE / DO NOT APPLY `20260910120000_*`** |
| UI/UX Excellence Track | **ACTIVE** / S0 COMPLETE / upcoming ASTRA gate — **no UI** |

---

## Evidence index

| File | Covers |
|------|--------|
| `docs/evidence/M2_CURRENT_NOTIFICATION_ARCHITECTURE_20260912.json` | R1, R2–R8 live floor |
| `docs/evidence/M2_PR69_RECONCILIATION_20260912.json` | R9 |
| `docs/evidence/M2_PR70_RECONCILIATION_20260912.json` | R10 |
| `docs/evidence/M2_SCHEMA_COLLISION_INVENTORY_20260912.json` | R11–R12, R13–R22, R23 |
| `docs/evidence/M2_SCOPE_BOUNDARY_20260912.json` | R26–R28, R30 |
| `docs/evidence/M2_REQUALIFICATION_TEST_MATRIX_20260912.json` | R23–R25 |

---

## R1 — Current main notification architecture

Trusted path after S0 Cut 2 (immutable):

```
authorized domain route / cron
  → producer (authz + load object)
    → service_role EXECUTE enqueue_outbound_notification(...)
      → notifications_queue (status=queued, cut2_provenance_version=1)
        → GET /api/cron/drain-notification-queue (CRON_SECRET)
          → renderCut2TrustedRow → AT / Meta / Resend
```

**RPC (live, MCP SELECT):**

```
public.enqueue_outbound_notification(
  p_notification_type text,
  p_domain_object_id uuid,
  p_channel notification_channel,
  p_recipient_membership_id uuid DEFAULT NULL,
  p_locale text DEFAULT NULL
) RETURNS TABLE(queue_id uuid, result text)
```

Results observed in function body + TS adapter: `inserted` | `duplicate` | `denied` | `trusted_idempotency_conflict_mismatch` (adapter also `fail_closed`).

TS adapter: `src/lib/enqueue-outbound-notification.ts` (`enqueueOutboundNotification`, `enqueueCut2ProducerChannels`). Production mode never table-inserts.

| Domain | Producer / route | Enqueue |
|--------|------------------|---------|
| Payment receipt | `payment-receipt-producer.ts` ← `/api/payments/receipt-notifications` | `enqueueCut2ProducerChannels` |
| Payment reminder | `payment-reminder-producer.ts` ← cron `0 8 * * *` | same |
| Welcome | `welcome-producer.ts` ← `/api/members/welcome-notifications` | same |
| Standing | `standing-change-producer.ts` ← `/api/members/standing-notifications` | same |
| Relief enrollment | `relief-enrollment-producer.ts` | same |
| Relief claims | `relief-claim-decision-producer.ts` | same |
| Remittance | `remittance-decision-producer.ts` | same (fan-out) |
| Hosting assignment | `hosting-assignment-producer.ts` | same |
| Hosting reminder | `hosting-reminder-producer.ts` ← cron `0 7 * * *` | same |
| Events | `event-reminder-producer.ts` ← cron `0 8 * * *` | same (fan-out) |
| Loan approved | `loan-approved-producer.ts` | same |
| Loan overdue | `loan-overdue-producer.ts` ← cron `0 10 * * *` | same (WA only) |
| Fines | `fine-issued-producer.ts` | same |
| Invitations | `member-invitation-producer.ts` | same (WA+email; prefs skip) |
| Minutes | `/api/minutes/published-notifications` | same (fan-out) |
| Elections | `/api/elections/opened-notifications` | same (WA only) |
| Announcements | `/api/announcements/enqueue` + cron `*/5` | same (WA+SMS; email DENY) |
| Proxy claim | `/api/proxy-claim/send` | `enqueueOutboundNotification` (email DENY) |
| Hosting swap | `/api/hosting/swap-notifications` | `enqueueCut2ProducerChannels` |
| Subscription | `subscription-expiring-producer.ts` ← cron `0 9 * * *` | same (fan-out) |

**Drain:** `/api/cron/drain-notification-queue` every 15 minutes. Selects `queued` **and** `cut2_provenance_version=1` only. Renderer: `src/lib/cut2-drain-render.ts`.

**Prefs:** `src/lib/notification-prefs.ts` + live RPC `get_notification_preferences`. Fail-closed on real-user read error. Invitation / proxy_claim skip prefs inside the enqueue RPC.

**Stale dormant path:** `src/lib/announcement-producer.ts` still contains `notifications_queue.insert`. Not imported by live routes. **Must never be wired.** Live announcements already use the trusted RPC. `announcement_deliveries` **does** exist in production (comment in that file is stale).

**In-app** `public.notifications` uses a different `notification_type` enum. It is not the 22 queue templates.

---

## R2–R8 — Cut 2 immutable floor (reconfirmed live)

| Rule | Live evidence |
|------|----------------|
| Trusted enqueue only | RPC exists; adapter RPC-only; relays 410 |
| Signature compatibility | Identity args + `TABLE(queue_id, result)` match Cut 2 freeze |
| 22 types | `CUT2_NOTIFICATION_TYPES` in `src/lib/cut2-channel-matrix.ts`; RPC `ELSE denied` |
| Channel matrix | WA all 22; SMS 19 with DENY `loan_overdue` / `member_invitation` / `election_opened`; email-only subset of 6; `proxy_claim` email DENY; push DENY all |
| Relays 410 | sms / wa / email send routes return 410 for GET and POST |
| Provenance | Column live. Counts (SELECT-only): **72** `=1`, **2330** NULL, **0** other, **2402** total. Drain never upgrades NULL. |
| Queue privileges | `anon` none; `authenticated` SELECT; `service_role` SELECT + column UPDATE `(status, error_message, attempts, sent_at, data)` only; **no** INSERT/DELETE/TRUNCATE; enqueue EXECUTE `service_role` only |

`cut2_internal_*` helpers: EXECUTE revoked from `anon` / `authenticated` / `service_role` (postgres only; called by DEFINER).

---

## R9 — PR #69 export classification

**Merge-base vs current main:** `0559b758bc53df3ec8081e361ffd022c1f19be43` (founder-stated old base **confirmed**). GitHub `baseRefName=main` but base SHA is pre-S0. **47** commits on main since, including Cut 1 apply, Cut 2, Cut 3.

Isolated rerun of the historical suite (copies in `/tmp`, not on this branch): **34/34 PASS**, zero sends.

| Export | Classification |
|--------|----------------|
| `RelativeTrigger`, `QuietHours`, `ScheduledOccurrence`, `ValidatePolicyResult`, `occurrenceIdentity`, `isInQuietHours`, `nextQuietHoursEnd`, `generateScheduledOccurrences` | **STILL VALID** |
| `DEFAULT_PAYMENT_COMPAT_NOTE`, `LEGACY_PAYMENT_CRON_CONTRACT`, `PAYMENT_LEGACY_COMPAT` | **STILL VALID** (live cron is still overdue-daily) |
| `PolicyDisposition`, `PolicyAnchorKind`, `NotificationPolicyConfig`, `DEFAULT_HOSTING_POLICY`, `DEFAULT_EVENT_POLICY`, `validatePolicyConfig`, `evaluateDisposition` | **VALID BUT NEEDS CUT2 ADAPTATION** (`SEND_NOW` = enqueue-eligible only; intersect Cut 2 matrix; dormant defaults) |
| `PolicyChannel` | **SECURITY CONFLICT** (push as sendable channel) |
| `FUTURE_PAYMENT_POLICY` | **PRD CONFLICT** if treated as live; keep labeled example only |

Full table: `docs/evidence/M2_PR69_RECONCILIATION_20260912.json`.

---

## R10 — PR #70 contracts / adapters / docs / tickets

Isolated rerun: **72/72 PASS** (34 + 38), zero sends.

| Artifact | Classification |
|----------|----------------|
| `PolicyPrecedence`, `resolveEffectivePolicy`, adapters, supersession, `FAIL_CLOSED_PREFS_ON_ERROR`, legacy parity helpers | **STILL VALID** |
| `ChannelIntersection`, `channelsFromSqlBooleans`, contract doc | **VALID BUT NEEDS CUT2 ADAPTATION** (AND Cut 2 matrix; force push DENY) |
| `UI_POLICY_LABELS` | **OUT OF M2** |
| `docs/tickets/PC-PAYMENT.md` / `PC-HOSTING` / `PC-EVENTS` | **SUPERSEDED** as tickets (stale base); salvage rules |
| `20260910120000_notification_policy_schema.sql` | **NEEDS REVISION** — **UNSAFE TO APPLY AS-IS** |

**Alternate send path:** none inside PR #70 files. **Reject any** future wiring that bypasses `enqueue_outbound_notification` (including `announcement-producer.ts` queue INSERT on main).

---

## R11 — Schema line review (`20260910120000_*`)

**Classification: NEEDS REVISION. Never apply.**

Keep as design: three-table split; IANA CHECK; repeat-requires-max; occurrences identity uniqueness; FORCE RLS; authenticated occurrences SELECT-only; `settings.manage` (do not invent `notifications.manage`); announcement domain omitted; no `notifications_queue` INSERT grant.

Must revise before any future `00117_*`:

1. `enabled DEFAULT true` → **false** (dormant-by-default).
2. `channel_push DEFAULT true` → **false** / omit push as sendable.
3. Channel defaults must not override Cut 2 DENY rows (hosting email, etc.).
4. `is_group_member` does **not** exclude exited on live prod; `has_group_permission` after Cut 1 **does** require `membership_status='active'`. Do not document the former as the exited gate.
5. Blanket `service_role` DML on occurrences → least-privilege **SECURITY DEFINER** workers later.
6. Filename must not be `20260910120000_*`.

---

## R12 — Future filename

**Recommend:** `00117_m2_notification_policy_foundation.sql`  
Acceptable: `00117_notification_policy_schema.sql`.  
**This task does not create the SQL file.**

---

## R13–R22 — Foundation design pins

| ID | Pin |
|----|-----|
| R13 | `notification_policies` = tenant schedule **intent** only |
| R14 | `notification_policy_triggers` = relative offsets |
| R15 | `notification_policy_occurrences` = dormant identity ledger |
| R16 | **Dormant-by-default** — no producer reads required for current crons to keep working |
| R17 | **Announcements policy dormant** — type `announcement` stays on Cut 2 enqueue; do not add policy domain; F3-06/M3 OUT |
| R18 | Adapter boundary = pure TS; enqueue stays Layer B RPC |
| R19 | Member prefs remain authoritative at enqueue (upper-bound intersection) |
| R20 | `PAYMENT_REMINDER_CONFIRMED_BASIS` stays default OFF; `?dryRun=true` queues nothing |
| R21 | **P0 bulk receipt guard** on `contributions/record/page.tsx` (`bulkSendReceipts` default false + reconfirm) — do not auto-fan receipts |
| R22 | Tenant authority = **`settings.manage` after Cut 1** (owner bypass; admin with zero assignments bypass; assigned officers need the key; JWT uid lock). `notifications.send` is send-time, not policy-admin. SECURITY DEFINER anticipation for future occurrence writers; never grant queue INSERT. |

**settings.manage assessment:** **KEEP.** Compatible with Cut 1. No evidence supports inventing `notifications.manage`.

---

## R23–R25 — Collisions and tests

**Collisions:** production policy tables empty; main has no policy engine files; no live table-name collision. The live collision risk is **semantic**: replacing or wrapping `enqueue_outbound_notification`, or copying `20260910120000_*` into the 00114–00116 sequence.

**Historical tests:** 34/34 and 72/72 **confirmed in isolation** (no send).

**New Cut 2 non-regression matrix:** 20 proposed cases in `M2_REQUALIFICATION_TEST_MATRIX_20260912.json` (docs only).

---

## R26 — Scope

- **IN M2:** adapted pure evaluator + contracts; dormant `00117_*` schema; settings.manage RLS; unit + Cut 2 non-regression tests; honesty pins.
- **DEFERRED PRODUCER WIRING:** PC-PAYMENT / HOSTING / EVENTS cutover, occurrence writes, shadow/dual-run.
- **DEFER M11:** UI policy editor; remaining domains; announcement policy; any later drain-side hold. M11 is not a named module on current main.
- **OUT:** merge #69/#70; apply old SQL; UI; M3/F3-06; relays; env; real send; Layer A.

---

## R27 — Disposition

**A — SUPERSEDE BOTH.**  

Evidence does **not** support merge or rebase of #69/#70 onto current main as the implementation vehicle. Salvage the pure math and adapter rules onto a **new** branch from `0c147f8e…`.

---

## R28 — Fresh implementation branch (future — do not create now)

`security/m2-notification-policy-foundation-20260912`  
Base: `0c147f8e1e7aadbfd14583f6a9bef465c2217fe1`  
Create only after founder implementation decision.

---

## R30 — UI / S0 / upcoming gate

UI/UX Excellence Track is **ACTIVE** and was deferred by the S0 gate, not cancelled (`docs/S0_P0C_CUT3_STORAGE_PATH_PLAN_20260912.md`). S0 is now **COMPLETE**. Next UX gate named there: **ASTRA**. **Do not start UI** in M2 foundation.

---

## Key conflicts (founder-facing)

1. PR #69/#70 sit on `0559b758` (Trust Cut 1 merge) — **47 commits** behind S0-complete main.
2. Evaluator defaults enable **push** and `enabled: true` — conflict with Cut 2 DENY + dormant-by-default.
3. `SEND_NOW` naming can be misread as a send API — must mean trusted enqueue only.
4. PR70 SQL grants and filename are pre-Cut 2.
5. Live `is_group_member` does not filter exited; Cut 1 `has_group_permission` does.
6. Dormant `announcement-producer.ts` still has a forbidden queue INSERT.
7. Live payment reminders are **not** a +24h policy trigger.

---

## Verdict

**PASS — M2 REQUALIFICATION COMPLETE; READY FOR FOUNDER M2 IMPLEMENTATION DECISION.**

No missing inventory item blocks the planning verdict. Implementation is **not** authorized by this document. Founder decision required before anyone authors `00117_*` or a `security/m2-notification-policy-foundation-20260912` branch.
