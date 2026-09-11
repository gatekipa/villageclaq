# S0 P0-B — Cut 2 Notification Queue / Outbound Relay Lockdown — Security Contract Freeze

**Date:** 2026-09-11  
**Status:** **PLANNING ONLY — READY FOR DAYBREAK REVIEW**  
**Overall recommended verdict:** **PASS — CUT 2 SECURITY CONTRACT COMPLETE; READY FOR DAYBREAK REVIEW**  
**Implementation:** **NOT AUTHORIZED** until Daybreak **PASS**. Daybreak PASS on this PR authorizes **IMPLEMENTATION ON A DEDICATED BRANCH only**, **NOT** production apply.  
**This artifact implements:** nothing (docs / evidence only)  
**Cut 2 SQL migration in this PR:** **NONE** (do not author `00115` or any Cut 2 `.sql` here)  
**Production mutation:** ZERO  
**Historical migrations modified:** NO  
**Messages sent:** ZERO  
**Failed queue rows retried:** ZERO  
**Cut 1:** **CLOSED** in production — do not modify  
**PR #69 / #70:** **OPEN DRAFT** — must stay **untouched / unapplied** (PR #70 SEPARATION; #69 foundation likewise)  
**PR #71:** **NOT TOUCHED** (no merge)  
**Authoritative freeze:** §21. Where earlier sections conflict with §21, **§21 wins**.  
**Evidence:** `docs/evidence/S0_CUT2_NOTIFICATION_QUEUE_LIVE_INVENTORY_20260911.json`

---

## 1. Authority pins

Cite exactly. Do not substitute nearby SHAs, deploys, or project refs.

| Pin | Exact value |
|-----|-------------|
| Production main (this planning base) | `1693b806beaf80d1c8101c8011874a2a2bcbb642` |
| Master PRD V1 PR #71 hard-freeze SHA | `050be86c9df3455c66b27bb5853eb786228b4009` |
| Cut 1 CLOSED production | version `20260911183755` name `s0_p0a_cut1_active_authorization` — **do not modify** |
| Cut 1 repo file (immutable for Cut 2) | `supabase/migrations/00114_s0_p0a_cut1_active_authorization.sql` |
| Supabase prod | `llbnliixczcqfftxpsmb` |
| Live `schema_migrations` count (Chief, prod) | **29** (includes Cut 1 `20260911183755`) |
| PR #69 (OPEN DRAFT foundation; do not merge/apply) | head `a8cdeaa98e6bb9e3a6cccaf815aa4ae4441b59a7` — `product-consistency/notification-policy-foundation-v2-20260910` |
| PR #70 (OPEN DRAFT CREATE-NOT-APPLY; do not merge/apply) | head `0f258726c9328ee0204f7b5dee9efceebe7265b9` — `security/notification-policy-schema-20260910` |
| PR #71 (docs governance; do not merge) | head `050be86c9df3455c66b27bb5853eb786228b4009` |
| Planning branch (this artifact) | `planning/s0-p0b-cut2-notification-queue-20260911` from `1693b806beaf80d1c8101c8011874a2a2bcbb642` |
| Prior Cut 1 planning contract (phases 1–22 template) | PR #75 `docs/S0_P0_REMEDIATION_CUT_PLAN_20260910.md` §19 bounded Cut 2 stub — **superseded by this freeze** |
| S0-A P0-B confirmation (2026-09-10) | PR #72 `97388b34037589a21eae66e3a5a1668f71e3bb55` §4 / §20 — INSERT `auth.uid() IS NOT NULL` |
| Live queue inventory source | Chief-verified 2026-09-11 capture — copied **verbatim** into evidence JSON (this task did **not** re-query production) |

Cut 1 is **CLOSED**. Cut 2 must consume post-Cut 1 **ACTIVE** membership primitives (`is_active_group_member`, `get_my_active_group_ids`, replaced `is_group_admin` / `has_group_permission`) and must **not** encode status-blind `is_group_member` / `get_user_group_ids` as its only producer gate.

---

## 2. Live INSERT authorization analysis (P0-B)

Source of live table/policy/grant facts: **Chief-verified inventory 2026-09-11** (verbatim in evidence JSON). This planning task did **not** execute production SQL.

### 2.1 Live table (Chief)

`public.notifications_queue`

| Column | Type / default | Notes |
|--------|----------------|-------|
| `id` | `uuid` PK `gen_random_uuid()` | |
| `user_id` | `uuid` NULL FK → `profiles(id)` ON DELETE CASCADE | Invitee / proxy rows may be NULL |
| `channel` | `notification_channel` NOT NULL | `email \| sms \| whatsapp \| push` |
| `template` | `text` NOT NULL | **no DB allowlist** |
| `data` | `jsonb` NOT NULL default `{}` | **no tenant CHECK**; **no `group_id` column** |
| `status` | `notification_queue_status` NOT NULL default `queued` | `queued \| sent \| failed` — **NO `processing` / claim state** |
| `error_message` | `text` | |
| `attempts` | `int4` default `0` | Drain retries **queued** only, max 3 (app) |
| `created_at` | `timestamptz` default `now()` | |
| `sent_at` | `timestamptz` | |

RLS: `enabled=true` `forced=false`.  
User triggers on the table: **none found** (Chief).  
No SQL `INSERT INTO notifications_queue` in repo migrations / edge functions (repo source).

### 2.2 Live policies (Chief)

| # | Name | Cmd | Qualifier |
|---|------|-----|-----------|
| 1 | `Authenticated users can queue notifications` | INSERT | `roles={}` USING `null` WITH CHECK `(auth.uid() IS NOT NULL)` |
| 2 | `Platform staff can view all notifications_queue` | SELECT | `is_platform_staff()` |
| 3 | `Staff can view notification queue` | SELECT | `is_platform_staff()` |
| 4 | `Staff can update notification queue` | UPDATE | `is_platform_staff()` |

**Forge (Chief):** authenticated **direct INSERT YES** (only `auth.uid() IS NOT NULL`); anon **effective INSERT NO** (WITH CHECK fails) but **GRANT INSERT still present**; **arbitrary `template` / `channel` / `data` YES**; **no `group_id` column**.

### 2.3 Live grants (Chief)

`anon` + `authenticated` + `service_role` + `postgres` all have `SELECT` / `INSERT` / `UPDATE` / `DELETE` / `TRUNCATE` / `REFERENCES` / `TRIGGER`.

**RLS does not apply to `TRUNCATE`.** Authenticated `TRUNCATE` on this table is a queue-wipe capability independent of the INSERT forge. Cut 2 **must** revoke it on this table (table-scoped; not a global grant sweep).

### 2.4 Repo origin (not a substitute for live)

- Table + fail-open INSERT: `supabase/migrations/00012_notification_queue.sql` (comment claims “system inserts via service role”; policy does not).
- Staff UPDATE: `00051_notification_queue_update_policy.sql` (comment: drain uses service_role and bypasses RLS; policy is “completeness” for dashboard).
- Duplicate staff SELECT: `00070_admin_p1_fixes.sql`.
- `GRANT ALL … TO authenticated`: `00048_rls_security_audit_fixes.sql`.
- Cut 1 `00114` header: **out of scope `notifications_queue`**.

### 2.5 What the forge allows today

Any logged-in browser (or any server using the user JWT / cookie `anon` client) can insert a row with:

- any `channel` enum value
- any `template` string (`generic`, attacker-chosen Meta template names, etc.)
- any `data` jsonb (arbitrary `recipient`, `message`, `whatsappType`, `components`)
- any `user_id` the FK allows (or NULL)
- `status = 'queued'` (or `sent` / `failed` if supplied — **no CHECK** that INSERT must be `queued`)

The drain (`GET /api/cron/drain-notification-queue`, every 15 minutes, `CRON_SECRET` + **service_role**) will then attempt SMS / email / WhatsApp for `status = 'queued'`. That is the outbound relay.

### 2.6 Critical compatibility (frozen — docs addendum)

These five facts are **apply-blocking** for Cut 2 implementation sequencing. They do not authorize SQL or app edits in this PR.

#### C1 — `sms-sender.ts` depends on the live INSERT policy (MUST move before/with revoke)

`src/lib/notifications/sms-sender.ts` `queueNotification` uses `createClient()` from `@/lib/supabase/server` (cookie session + `NEXT_PUBLIC_SUPABASE_ANON_KEY`). On AT key missing or SDK failure it INSERTs:

```ts
{ channel, template: "generic", data: { recipient, ...data }, status: "queued" }
```

`data` is a **free-form `message` string + arbitrary phone** (`recipient`). There is no template allowlist, no `groupId`, no producer key.

That path **DEPENDS** on live policy `Authenticated users can queue notifications` / `WITH CHECK (auth.uid() IS NOT NULL)` (plus `GRANT INSERT` to `authenticated`).  

**Cut 2 MUST move this insert to `service_role` (or a bounded `SECURITY DEFINER` enqueue) BEFORE or IN THE SAME implementation commit as** DROP of that policy / `REVOKE INSERT` from `authenticated`. SQL-only policy drop **without** this move is **`CUT2_ABORT`**: session-path SMS fallback queueing breaks, and leaving it on the authenticated path is **high forge-adjacent risk** (any request that reaches `sendSMS` with a user cookie can enqueue arbitrary phone + free-form SMS body for the drain to send).

Cron callers of `sendSMS` typically have **no cookies** → `auth.uid()` NULL → WITH CHECK already fails. Moving to service_role also **repairs** that cron fallback.

#### C2 — Canonical domain producers survive INSERT *policy* drop iff service_role GRANT INSERT remains

Payment / welcome / standing / relief / hosting / event / loan / fine / invitation / subscription producers are invoked from API/cron routes that construct **`createClient(url, SUPABASE_SERVICE_ROLE_KEY)`** and pass that client into `produce*`. `service_role` **bypasses RLS**.

Therefore: **DROP** of `Authenticated users can queue notifications` does **not** break those producers **IF** `GRANT INSERT` on `notifications_queue` to `service_role` **remains**.

**Layer distinction (do not collapse):**

| Layer | SQL action | Domain producers | sms-sender (today) |
|-------|------------|------------------|--------------------|
| **A — close the forge** | DROP authenticated INSERT policy; `REVOKE INSERT` from `anon`/`authenticated` | **Survive** (service_role grant + RLS bypass) | **Breaks** unless already moved (C1) |
| **B — RPC allowlist** | also `REVOKE INSERT` from `service_role`; only `enqueue_outbound_notification` may insert | **Break** until each `.insert()` switches to RPC | Must use RPC or skip |

Layer B is the stricter freeze in §6 / §7. It is **not** implied by policy drop alone. Implementation must not revoke `service_role` INSERT while producers still call `.from("notifications_queue").insert`.

#### C3 — Zero UI insert call-sites; forge is PostgREST + sms-sender session path

Repo tip: **zero** `*.tsx` / UI `.from("notifications_queue").insert` call-sites. The live forge is:

1. PostgREST + RLS policy `auth.uid() IS NOT NULL` + `GRANT INSERT` to `authenticated` (any logged-in client SDK)
2. `sms-sender.ts` session/anon-key path (C1)

Not a current dashboard button that writes the queue directly.

#### C4 — Live prod confirmation (`llbnliixczcqfftxpsmb`)

Chief-confirmed (do not invent extras):

- `schema_migrations` **29** rows
- Cut 1 version **`20260911183755`** name `s0_p0a_cut1_active_authorization`
- INSERT policy **`Authenticated users can queue notifications`** / `WITH CHECK (auth.uid() IS NOT NULL)`
- `GRANT INSERT` for **`anon` + `authenticated` + `service_role`**
- **no `group_id` column**
- status enum **`queued | sent | failed` only** (no `processing`)

#### C5 — PR #69 / #70 remain OPEN DRAFT

Both stay **untouched and unapplied**. Cut 2 must not merge, rebase onto, or apply either. See §20.

---

## 3. Remediation order (Cut 2 position)

| Cut | P0 | Objective | State |
|-----|----|-----------|-------|
| **Cut 1** | P0-A | Active membership / authorization boundary | **CLOSED** production `20260911183755` — **do not modify** |
| **Cut 2** | P0-B | `notifications_queue` INSERT lockdown: trusted server only; revoke ordinary authenticated direct INSERT; tenant / recipient / template / payload authority at enqueue; drain service_role-only mutate; failed-row **NO RETRY**; prefs fail-closed preserved; quiet-hours **defer-compatible** (do not drop) | **THIS FREEZE** (docs only) |
| **Cut 3** | P0-C | Storage write/delete fail-open closure | **NOT STARTED** — §19 SEPARATION |

Independent cut. **One new forward-only migration after `00114`.** Never edit `00001`–`00114`. Never apply PR #70 as Cut 2. Never start M2 / F3-06 / Cut 3 in the Cut 2 implementation PR.

---

## 4. Dependency graph

```
Cut 1 CLOSED (20260911183755)
        │
        ▼
this Cut 2 contract ──► Daybreak PASS / HOLD
        │
        │  PASS authorizes IMPLEMENT on a dedicated branch only
        │  (NOT production apply; NOT this planning PR)
        ▼
CONTRACT PASS → IMPLEMENT on dedicated branch
  → author ONE forward-only migration AFTER 00114
  → C1: sms-sender → service_role/DEFINER BEFORE/WITH Layer A
  → Layer A: DROP authenticated INSERT policy (domain producers survive if service_role GRANT INSERT remains)
  → Layer B (if frozen): RPC + revoke service_role table INSERT (requires produce* RPC switch)
  → disposable no-send harness → negatives + regression
  → SHA freeze → founder prod auth → apply one
  → read-only postconditions (no drain invoke; no provider calls)
        │
        ├── Cut 3 storage (later)     §19 SEPARATION
        ├── PR #70 requal             §20 SEPARATION
        └── M2 quiet-hours DEFER_UNTIL / F3-06   §20 SEPARATION
```

**Hard edges**

- Cut 2 must **not** call status-blind `is_group_member` / `get_user_group_ids` as its only producer gate.
- Cut 2 must **not** apply, merge, or rewrite PR #69 foundation or PR #70 `notification_policies` / `notification_policy_triggers` / `notification_policy_occurrences`.
- **C1 hard gate:** do not DROP `Authenticated users can queue notifications` / `REVOKE INSERT` from `authenticated` unless `sms-sender.ts` already writes via `service_role` or bounded DEFINER (same implementation commit is allowed; SQL-only first is **ABORT**).
- Cut 2 must **not** add `processing` to `notification_queue_status` (would force drain rewrite + send-path risk). Browser non-claim is achieved by **REVOKE UPDATE** from `anon`/`authenticated` + **DROP** staff UPDATE policy.
- Cut 2 must **not** retry or delete `status = 'failed'` rows.
- Cut 2 must **not** drop queued rows for quiet hours. M2 may later `DEFER_UNTIL`; Cut 2 leaves rows `queued`.
- Historical journal `00001`–`00114`: **immutable**.
- Announcement producer (Build 8) stays **DORMANT**. Do not wire. Do not apply `00106`/`00107`.

---

## 5. Producer model and classification

Classification vocabulary (use **only** these labels). If unsure → **UNKNOWN — FAIL CLOSED**.

| Label | Meaning |
|-------|---------|
| **TRUSTED SERVER** | Next.js server library / route; queue write must use **service_role** (or enqueue RPC executable only by service_role) |
| **BROWSER-INITIATED SERVER-AUTHORIZED** | Browser `fetch` + user JWT → API route authorizes → **service_role** enqueue |
| **SERVICE/CRON** | `Authorization: Bearer CRON_SECRET` (or Meta webhook signature) + **service_role** |
| **LEGACY DIRECT CLIENT** | Browser or cookie/`anon` JWT performs `.from("notifications_queue").insert` |
| **DORMANT** | Source exists; **not imported** by any live route/cron |
| **UNKNOWN — FAIL CLOSED** | Cannot prove call-site or client role |

### 5.1 Named WhatsApp producers (repo tip `1693b806`)

All `src/lib/*-producer.ts` modules accept an injected `SupabaseClient` and insert WhatsApp rows. They do **not** construct the client. Classification is by **caller**.

| Producer | Template(s) | Live caller | Class | Prefs | Idempotency key (unique index / check) |
|----------|-------------|-------------|-------|-------|----------------------------------------|
| `payment-receipt-producer` | `payment_receipt` | `POST /api/payments/receipt-notifications` | **BROWSER-INITIATED SERVER-AUTHORIZED** | `getEnabledChannels` (`payment_reminders` type used by receipt path — see producer) fail-closed | `data.paymentId` — `idx_notifications_queue_whatsapp_payment_receipt_unique` |
| `payment-reminder-producer` | `payment_reminder` | `GET /api/cron/payment-reminders` | **SERVICE/CRON** | fail-closed | `(obligationId, reminderDate)` |
| `welcome-producer` | `welcome` | `POST /api/members/welcome-notifications` | **BROWSER-INITIATED SERVER-AUTHORIZED** | fail-closed | `data.membershipId` |
| `standing-change-producer` | `standing_changed` | `POST /api/members/standing-notifications` (from `calculate-standing.ts`) | **BROWSER-INITIATED SERVER-AUTHORIZED** | fail-closed | `(membershipId, newStanding, changeDate)` |
| `relief-enrollment-producer` | `relief_enrollment` | `POST /api/relief/enrollment-notifications` | **BROWSER-INITIATED SERVER-AUTHORIZED** | fail-closed | `data.enrollmentId` |
| `relief-claim-decision-producer` | `relief_claim_approved` / `relief_claim_denied` | `POST /api/relief/claim-notifications` | **BROWSER-INITIATED SERVER-AUTHORIZED** | `relief_updates` fail-closed | `data.claimId` per decision template |
| `remittance-decision-producer` | `remittance_confirmed` / `remittance_disputed` | `POST /api/relief/remittance-notifications` | **BROWSER-INITIATED SERVER-AUTHORIZED** | fail-closed | `(remittanceId, recipientUserId)` per decision |
| `hosting-assignment-producer` | `hosting_assignment` | `POST /api/hosting/assignment-notifications` | **BROWSER-INITIATED SERVER-AUTHORIZED** | fail-closed | `data.assignmentId` |
| `hosting-reminder-producer` | `hosting_reminder` | `GET /api/cron/hosting-reminders` | **SERVICE/CRON** | fail-closed | `(assignmentId, assignedDate)` |
| `event-reminder-producer` | `event_reminder` | `GET /api/cron/event-reminders` | **SERVICE/CRON** | fail-closed | `(eventId, userId)` |
| `loan-approved-producer` | `loan_approved` | `POST /api/loans/approval-notifications` | **BROWSER-INITIATED SERVER-AUTHORIZED** | `loan_updates` fail-closed | `data.loanId` |
| `loan-overdue-producer` | `loan_overdue` | `GET /api/cron/loan-overdue-reminders` | **SERVICE/CRON** | fail-closed | `(loanId, reminderDate)` |
| `fine-issued-producer` | `fine_issued` | `POST /api/fines/issued-notifications` | **BROWSER-INITIATED SERVER-AUTHORIZED** | `fine_updates` fail-closed | `data.fineId` |
| `member-invitation-producer` | `member_invitation` | `POST /api/invitations/whatsapp-notifications` | **BROWSER-INITIATED SERVER-AUTHORIZED** | **no profile prefs** (invitee has no account; `user_id` NULL) | `(invitationId, sendDate)` |
| `subscription-expiring-producer` | `subscription_expiring` | `GET /api/cron/subscription-reminders` | **SERVICE/CRON** | fail-closed | `(subscriptionId, reminderDate, userId)` |
| `announcement-producer` | `announcement` | **none** (file header: DORMANT Build 8; not imported) | **DORMANT** | fail-closed in source; **must not wire** | none live; `00106`/`00107` **not** this cut |

Browser-initiated producer routes share one pattern (repo): Bearer JWT `getUser` → **403** unless recorder/self/active owner-admin (or invitation inviter) or `isPlatformStaff` → `createClient(url, SERVICE_ROLE)` → `produce*(adminClient, id)`.

Cron producers: `CRON_SECRET` Bearer → service_role client → `produce*`.

### 5.2 Other queue INSERT call-sites

| Call-site | Class | Client used for INSERT | Cut 2 fate |
|-----------|-------|------------------------|------------|
| `src/lib/notifications/sms-sender.ts` `queueNotification` | **TRUSTED SERVER** library with **LEGACY authenticated insert** | `createClient()` from `@/lib/supabase/server` = **cookie + anon key** (user JWT if present; **anon if cron**) | **C1 HARD GATE:** move to `service_role` or bounded DEFINER **before/with** INSERT policy drop. Payload is `template: "generic"` + free-form `data.message` + arbitrary `recipient` phone — **forge-adjacent** if left on authenticated. Cron-without-cookies already fails WITH CHECK (`auth.uid()` NULL). |
| `src/app/api/whatsapp/send/route.ts` `queueWhatsAppMessage` | **BROWSER-INITIATED SERVER-AUTHORIZED** (JWT + `callerCanMessageTarget` / staff) overflow / retryable Meta failure | **service_role** direct INSERT; `template` from request body (`type` / `template` / `"generic"`) | Must call enqueue RPC; **template allowlist**; no arbitrary Meta template name |
| `src/app/api/sms/send/route.ts` | **BROWSER-INITIATED SERVER-AUTHORIZED** (JWT + recipient guard) | Delegates to `sendSmsNotification` → sms-sender (legacy insert) | Companion with sms-sender |
| `src/app/api/proxy-claim/send/route.ts` | **TRUSTED SERVER** | sms-sender fallback | Companion with sms-sender |
| Cron SMS paths (`payment-reminders`, `event-reminders`, `hosting-reminders`, `subscription-reminders`, `send-scheduled-announcements`) | **SERVICE/CRON** | sms-sender fallback (cookie client → **anon** on cron) | Companion; cron fallback must use service_role + RPC |
| `src/lib/announcement-producer.ts` | **DORMANT** | would use injected client | Do not wire |

**No** `*.tsx` / UI `.from("notifications_queue").insert` call-sites on this tip (**C3**). The live forge is **PostgREST RLS** (`Authenticated users can queue notifications` + `GRANT INSERT` to `authenticated`) **plus** the **sms-sender session path** (**C1**). Not a dashboard insert button.

### 5.3 Workers (mutate, not produce)

| Worker | Auth | Client | Queue ops | Class |
|--------|------|--------|-----------|-------|
| `GET /api/cron/drain-notification-queue` | `CRON_SECRET` | service_role | SELECT `status='queued'` LIMIT 50; UPDATE sent/failed/attempts | **SERVICE/CRON** |
| `POST /api/webhooks/whatsapp` | Meta `x-hub-signature-256` | service_role | SELECT by `data.providerMessageId`; UPDATE `data` only (status events) | **SERVICE/CRON** |
| Admin UI `src/app/[locale]/admin/notifications/page.tsx` | platform staff (client) | user JWT | **SELECT only** (`id, status, created_at`) | staff read; **must not UPDATE** after Cut 2 |

Drain retries: increment `attempts` while `status` stays `queued` until `attempts >= 3`, then `failed`. **Does not select `failed`.** Unique indexes span **all** statuses → failed WhatsApp producer keys **cannot** be re-inserted. Cut 2 **NO RETRY** of failed rows (no status flip, no delete+insert).

### 5.4 Counts (this tip)

| Class | Named producers | Other INSERT sites | Workers |
|-------|-----------------|--------------------|---------|
| BROWSER-INITIATED SERVER-AUTHORIZED | **10** | **2** (`/api/whatsapp/send`, `/api/sms/send` via sms-sender) | 0 |
| SERVICE/CRON | **5** | cron SMS fallbacks (same sms-sender) | **2** (drain + webhook) |
| TRUSTED SERVER (legacy insert path) | 0 | **1** (`sms-sender.ts`) | 0 |
| LEGACY DIRECT CLIENT (wired UI) | **0** | **0** (forge remains open) | 0 |
| DORMANT | **1** (announcement / Build 8) | 0 | 0 |
| UNKNOWN — FAIL CLOSED | **0** named | any unsigned future site | 0 |

**Producer-module total:** 16 files (`*-producer.ts`). **Live wired:** 15. **Dormant:** 1.

### 5.5 Direct-dispatch (not queue producers) — do not confuse

`GET /api/cron/send-scheduled-announcements` sends email/SMS/WhatsApp **directly** (Build 7). It is **SERVICE/CRON** and **not** a `notifications_queue` producer except sms-sender fallback. Build 8 `announcement-producer` remains **DORMANT**. Cut 2 does **not** producerize announcements.

---

## 6. Cut 2 exact contract

### 6.1 Producer model (frozen)

1. **Trusted server only.** Ordinary `authenticated` / `anon` **direct table INSERT is revoked** (Layer A).
2. **C1:** `sms-sender.ts` MUST write via `service_role` or bounded `SECURITY DEFINER` **before or with** Layer A. Leaving free-form `message` + arbitrary phone on the authenticated path is **forge-adjacent** and forbidden.
3. **C2:** Canonical `produce*` modules called with route-constructed **service_role** clients **survive Layer A** (policy drop) **iff** `GRANT INSERT` to `service_role` remains. Do not treat policy drop as breaking payment/welcome/etc.
4. **Layer B (stricter, same Cut 2 object list):** the only INSERT path becomes `public.enqueue_outbound_notification(...)` `SECURITY DEFINER` `SET search_path TO ''`, `REVOKE` from `PUBLIC` / `anon` / `authenticated`, `GRANT EXECUTE` to **`service_role` only**, and `service_role` **table INSERT is revoked**. Layer B **does not survive** while producers still `.insert()` — ship RPC switch in the same implementation PR, or do not revoke `service_role` INSERT until they have.
5. Browser-initiated routes remain allowed **only** as they exist today (JWT + tenant/role checks) and enqueue via service_role (Layer A) or service_role → RPC (Layer B). Cut 2 SQL does not add new browser enqueue grants.
6. Cut 2 SQL does **not** send, drain, or retry.

### 6.2 Tenant / recipient / template / payload authority

Enforced **inside** `enqueue_outbound_notification` (service_role bypasses RLS; RLS cannot be the tenant gate).

| Check | Rule |
|-------|------|
| `channel` | Must be `email` \| `sms` \| `whatsapp` \| `push` |
| `template` | Must be in the **Cut 2 allowlist** (§7.4). Unknown → **DENY** |
| `status` | INSERT must be `queued` only. Caller cannot insert `sent` / `failed` |
| Tenant | `data ? 'groupId'` AND `data->>'groupId'` is UUID, **except** `subscription_expiring` (platform billing; require `subscriptionId` + `userId`) and sms-sender `generic` **REJECTED** (no generic) |
| Recipient | `data.recipient` required non-empty text for sms/whatsapp/email. `push` **DENY** in Cut 2 (enum exists; no live producer) |
| Payload | Per-template required keys (§9). Extra keys allowed. Empty required key → **DENY** |
| Membership | If `data.groupId` present and `user_id` present: `is_active_group_member` is **not** sufficient alone (recipient may be the member, not the caller). RPC runs as definer with **no `auth.uid()`**. Tenant check is: `EXISTS` group row for `groupId`. Recipient-vs-group binding is **producer-layer** (already in routes). RPC does **not** invent a weaker cross-tenant bind than producers. |
| Cross-tenant | If `user_id` NOT NULL and `groupId` present: `EXISTS` membership `(user_id, group_id)` **any status** (historical recipient OK) **OR** template is `member_invitation` (`user_id` NULL allowed). Fail closed if `user_id` set and no membership in that group. |
| Prefs | **Not** re-implemented in SQL. Producers keep `getEnabledChannels` fail-closed. RPC does not force-send by ignoring prefs. |
| Quiet hours | RPC does **not** delete or reject for quiet hours. Leave `queued` (M2 `DEFER_UNTIL` compatible). |
| Idempotency | Unique indexes **UNCHANGED**. Unique violation → RPC returns `duplicate` (not an update of failed rows). |
| Failed rows | RPC **never** `DELETE` / `UPDATE` existing rows. **NO RETRY**. |

### 6.3 Worker / drain authorization

| Actor | SELECT | INSERT | UPDATE | DELETE / TRUNCATE |
|-------|--------|--------|--------|-------------------|
| `anon` | DENY (revoke + no policy) | DENY | DENY | DENY |
| `authenticated` (including platform staff JWT) | ALLOW via existing staff SELECT policies only | DENY | **DENY** (browser must **not** claim) | DENY |
| `service_role` | ALLOW (grant; RLS bypass) | **DENY table**; EXECUTE enqueue RPC only | ALLOW table UPDATE (drain + webhook) | DENY |
| `postgres` | owner | owner (migrations) | owner | owner |

Drain remains `CRON_SECRET` + service_role. Browser staff dashboard stays **read-only** on the queue.  
**Do not** add `processing` claim state in Cut 2. Concurrent drain double-send is a **pre-existing P1**, not this P0.

### 6.4 Preference fail-closed + quiet hours

- Preserve `getEnabledChannels()` catch → external channels **false** (`src/lib/notification-prefs.ts`).
- Preserve `get_notification_preferences(p_user_id)` (00054). Do not replace with a client-only prefs read.
- Quiet hours are **stored** (`profiles.notification_preferences.quiet_hours`) and **not enforced** today (`NOTIFICATION_CHANNEL_AUDIT.md` Risk 2). Cut 2 **must not** start dropping queue rows to “honor” quiet hours. M2 may add `DEFER_UNTIL`. Compatibility = **defer, not drop**.

### 6.5 Idempotency + failed-row NO RETRY

Preserve all live WhatsApp unique indexes (Chief + repo). Implementation must `CREATE UNIQUE INDEX IF NOT EXISTS` **only if** a loud precondition finds one missing — **do not DROP/rebuild** indexes (rewrite would lock and could fail on duplicates). Default: **UNCHANGED**.

Failed row = unique key occupied → producer already skips; RPC returns `duplicate`; drain never selects `failed`; **no admin retry** in Cut 2.

### 6.6 Loud preconditions (implementation migration, later)

`RAISE EXCEPTION` / `CUT2_ABORT` (never NOTICE+skip) if any of:

1. Cut 1 version `20260911183755` / `s0_p0a_cut1_active_authorization` **absent** from `supabase_migrations.schema_migrations`.
2. Policy `Authenticated users can queue notifications` missing or WITH CHECK drifted from `auth.uid() IS NOT NULL`.
3. Table missing; or a `group_id` column **already exists** (unexpected — ABORT, do not invent a dual contract).
4. Enum already contains `processing` (unexpected drift).
5. Expected unique index names from §7.6 missing (ABORT; do not silently skip).
6. `to_regclass('public.notification_policies')` IS NOT NULL — PR #70 leaked; **ABORT** (Cut 2 must not share a migration with #69/#70).
7. **C1:** `sms-sender.ts` on the implementation tip still imports `@/lib/supabase/server` `createClient` for `notifications_queue` INSERT → **`CUT2_ABORT`** (must move before/with policy drop).
8. Live Cut 1 version is not `20260911183755` / migration count unexpected vs Chief **29** → **ABORT** (do not guess; re-read-only confirm).

### 6.7 Postconditions

1. Authenticated JWT **cannot** INSERT (PostgREST 401/42501 or 0 rows).
2. Anon **cannot** INSERT (grant + check).
3. Authenticated staff **cannot** UPDATE/DELETE/TRUNCATE.
4. `service_role` table INSERT **fails**; RPC with allowlisted payload **succeeds** (disposable only).
5. RPC with unknown template / missing `groupId` / missing recipient **fails**.
6. All §7.6 unique indexes still present (same names).
7. Cut 1 helpers / policies **byte-identical** (or documented `prosrc` md5 unchanged for Cut 1 objects).
8. No queue row status flipped from `failed` → `queued`.
9. No provider HTTP in the harness.

---

## 7. Exact object scope

### 7.1 CREATE (Cut 2)

| Object | Name | Notes |
|--------|------|-------|
| FUNCTION | `public.enqueue_outbound_notification(p_user_id uuid, p_channel public.notification_channel, p_template text, p_data jsonb)` | `SECURITY DEFINER`; `SET search_path TO ''`; returns `TABLE(id uuid, result text)` where `result ∈ {inserted, duplicate, denied}`; **does not send** |
| FUNCTION | `public.cut2_expect_queue_policy(p_name text, p_cmd text, p_qual text, p_with_check text)` | precondition helper; `SET search_path TO ''`; **not** granted to authenticated |
| FUNCTION | `public.cut2_notification_template_allowed(p_template text)` | `IMMUTABLE`; allowlist predicate used by enqueue; empty `search_path` |

No new tables. No new enum values. No `group_id` column. No `notification_policies`.

### 7.2 REPLACE

**None.** Do not `CREATE OR REPLACE` Cut 1 helpers, `is_platform_staff`, `get_notification_preferences`, or drain SQL (there is none).

### 7.3 REWRITE (DROP + CREATE / DROP)

| Object | Action |
|--------|--------|
| POLICY `"Authenticated users can queue notifications"` | **DROP** |
| POLICY `"Staff can update notification queue"` | **DROP** (browser must not claim / mutate) |

SELECT policies **UNCHANGED**:

- `"Platform staff can view all notifications_queue"`
- `"Staff can view notification queue"`

Optional belt-and-suspenders (only if Daybreak requires a named INSERT deny policy in addition to REVOKE):

| Object | Action |
|--------|--------|
| POLICY `"notifications_queue_insert_deny_client"` | **CREATE** `FOR INSERT TO anon, authenticated WITH CHECK (false)` |

Default freeze: **omit** the deny policy if REVOKEs are proven; **include** it if disposable shows GRANT residual. Implementation must not create an INSERT policy that re-opens `auth.uid() IS NOT NULL`.

### 7.4 Template allowlist (enqueue RPC)

Exact names (WhatsApp producer templates + no `generic`):

`payment_receipt`, `payment_reminder`, `welcome`, `standing_changed`, `relief_enrollment`, `relief_claim_approved`, `relief_claim_denied`, `remittance_confirmed`, `remittance_disputed`, `hosting_assignment`, `hosting_reminder`, `event_reminder`, `loan_approved`, `loan_overdue`, `fine_issued`, `member_invitation`, `subscription_expiring`

**Not allowlisted in Cut 2:** `announcement`, `generic`, `push`, arbitrary Meta names, email template aliases.

SMS/email queueing after Cut 2: either map to the same allowlisted template keys with required `data` keys, or **do not enqueue** (fail closed). sms-sender’s current `template: "generic"` is **rejected** — companion must pass a real allowlisted key or skip queue.

### 7.5 REVOKE / GRANT (exact)

```
REVOKE ALL ON TABLE public.notifications_queue FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.notifications_queue FROM authenticated;
GRANT SELECT ON TABLE public.notifications_queue TO authenticated;   -- staff RLS SELECT only

REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.notifications_queue FROM service_role;
GRANT SELECT, UPDATE ON TABLE public.notifications_queue TO service_role;

REVOKE ALL ON FUNCTION public.enqueue_outbound_notification(uuid, public.notification_channel, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_outbound_notification(uuid, public.notification_channel, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.cut2_expect_queue_policy(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cut2_notification_template_allowed(text) FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE on cut2_notification_template_allowed to service_role only if enqueue is SQL-language and needs it;
-- prefer INTERNAL use (same definer) with no GRANT.
```

`postgres` ownership unchanged. Do **not** REVOKE from `postgres`.

### 7.6 Indexes — UNCHANGED (do not DROP)

| Name | Protects |
|------|----------|
| `idx_notifications_queue_whatsapp_payment_receipt_unique` | `payment_receipt` / `paymentId` |
| `idx_notifications_queue_whatsapp_welcome_unique` | `welcome` / `membershipId` |
| `idx_notifications_queue_whatsapp_relief_enrollment_unique` | `relief_enrollment` / `enrollmentId` |
| `idx_notifications_queue_whatsapp_hosting_assignment_unique` | `hosting_assignment` / `assignmentId` |
| `idx_notifications_queue_whatsapp_payment_reminder_unique` | `payment_reminder` / `(obligationId, reminderDate)` |
| `idx_notifications_queue_whatsapp_standing_changed_unique` | `standing_changed` / `(membershipId, newStanding, changeDate)` |
| `idx_notifications_queue_whatsapp_fine_issued_unique` | `fine_issued` / `fineId` |
| `idx_notifications_queue_whatsapp_loan_approved_unique` | `loan_approved` / `loanId` |
| `idx_notifications_queue_whatsapp_claim_approved_unique` | `relief_claim_approved` / `claimId` |
| `idx_notifications_queue_whatsapp_claim_denied_unique` | `relief_claim_denied` / `claimId` |
| `idx_notifications_queue_whatsapp_member_invitation_unique` | `member_invitation` / `(invitationId, sendDate)` |
| `idx_notifications_queue_whatsapp_loan_overdue_unique` | `loan_overdue` / `(loanId, reminderDate)` |
| `idx_notifications_queue_whatsapp_remittance_confirmed_unique` | `remittance_confirmed` / `(remittanceId, recipientUserId)` |
| `idx_notifications_queue_whatsapp_remittance_disputed_unique` | `remittance_disputed` / `(remittanceId, recipientUserId)` |
| `idx_notifications_queue_whatsapp_hosting_reminder_unique` | `hosting_reminder` / `(assignmentId, assignedDate)` |
| `idx_notifications_queue_whatsapp_event_reminder_unique` | `event_reminder` / `(eventId, userId)` |
| `idx_notifications_queue_whatsapp_subscription_expiring_unique` | `subscription_expiring` / `(subscriptionId, reminderDate, userId)` |

Also leave non-unique `idx_notifications_queue_status`, `idx_notifications_queue_user`, `idx_notifications_queue_created`, and repo `idx_notifications_queue_queued` (00105) if present. **Do not invent live presence of 00105.**

### 7.7 Out of Cut 2 object scope

Cut 1 functions/policies. Storage. F0/F3. PR #70 tables. `00106`/`00107`. `announcement` allowlist. `processing` enum. `group_id` column. Global TRUNCATE sweep on other tables. Drain route rewrite (except companion **stop using user JWT for insert**). Real sends. Failed-row retry admin UI.

---

## 8. Before / after behavior

| Actor / action | Before (live) | After Cut 2 |
|----------------|---------------|-------------|
| Authenticated PostgREST INSERT arbitrary row | **ALLOW** | **DENY** |
| Anon INSERT | GRANT yes; WITH CHECK no | **DENY** (revoke grant) |
| Authenticated TRUNCATE | **ALLOW** (RLS bypass) | **DENY** |
| Platform staff JWT UPDATE queue | **ALLOW** | **DENY** |
| Platform staff JWT SELECT | ALLOW | ALLOW (unchanged) |
| service_role table INSERT | ALLOW (bypass RLS) | **Layer A: still ALLOW** (C2 — domain producers survive). **Layer B: DENY**; must RPC |
| service_role RPC allowlisted enqueue | n/a | **ALLOW** → `queued` |
| service_role RPC unknown template / no tenant key | n/a | **DENY** |
| service_role drain UPDATE queued → sent/failed | ALLOW | ALLOW |
| Browser claim / flip `failed` → `queued` | staff UPDATE could | **DENY** |
| Unique-key re-enqueue after `failed` | unique violation / producer skip | **same** (NO RETRY) |
| Quiet-hours queued row | stays queued (unenforced) | stays queued |
| Announcement producer | unwired | unwired |
| Cut 1 active helpers | closed | **untouched** |
| Provider send | drain may send | **unchanged code path**; rehearsal must **not** invoke drain against prod |

---

## 9. Producer-by-producer authority matrix

Required `data` keys for enqueue RPC (plus `recipient` except where noted). `groupId` required unless noted.

| Family | Template | Tenant | Recipient | Required payload keys | Prefs | Failed NO RETRY |
|--------|----------|--------|-----------|----------------------|-------|-----------------|
| Payment receipt | `payment_receipt` | `groupId` | member phone | `paymentId`, `membershipId` | fail-closed | unique `paymentId` |
| Payment reminder | `payment_reminder` | `groupId` | member phone | `obligationId`, `reminderDate` | fail-closed | unique pair |
| Welcome | `welcome` | `groupId` | member phone | `membershipId` | fail-closed | unique `membershipId` |
| Standing | `standing_changed` | `groupId` | member phone | `membershipId`, `newStanding`, `changeDate` | fail-closed | unique triple |
| Relief enrollment | `relief_enrollment` | `groupId` | member phone | `enrollmentId` | fail-closed | unique `enrollmentId` |
| Relief claim | `relief_claim_approved` / `_denied` | `groupId` | claimant phone | `claimId` | `relief_updates` fail-closed | unique `claimId` per template |
| Remittance | `remittance_confirmed` / `_disputed` | `groupId` (branch) | **branch active owner/admin** phones | `remittanceId`, `recipientUserId` | fail-closed | unique pair per template |
| Hosting assignment | `hosting_assignment` | `groupId` | assignee phone | `assignmentId` | fail-closed | unique `assignmentId` |
| Hosting reminder | `hosting_reminder` | `groupId` | assignee phone | `assignmentId`, `assignedDate` | fail-closed | unique pair |
| Event reminder | `event_reminder` | `groupId` | member phone | `eventId`, `userId` | fail-closed | unique pair |
| Loan approved | `loan_approved` | `groupId` | borrower phone | `loanId` | fail-closed | unique `loanId` |
| Loan overdue | `loan_overdue` | `groupId` | borrower phone | `loanId`, `reminderDate` | fail-closed | unique pair |
| Fine | `fine_issued` | `groupId` | fined member phone | `fineId` | fail-closed | unique `fineId` |
| Invitation | `member_invitation` | `groupId` | invitee phone; `user_id` NULL | `invitationId`, `sendDate` | N/A (no account) | unique pair |
| Subscription | `subscription_expiring` | **no groupId**; `subscriptionId` | billed user | `subscriptionId`, `reminderDate`, `userId` | fail-closed | unique triple |
| Announcement (Build 8) | `announcement` | n/a | n/a | **DENY** (dormant) | n/a | n/a |

Route-layer recipient authority (already in repo; Cut 2 must not weaken):

- Receipt: `recorded_by = auth.uid()` OR active owner/admin of `payment.group_id` OR staff.
- Welcome: joining `user_id = auth.uid()` OR staff.
- Standing: affected member OR active owner/admin OR staff.
- Hosting assignment / relief enrollment: active owner/admin of roster/plan group OR staff (batch IDs must all be in caller’s groups).
- Fine / loan / claim / remittance / invitation: issuer/reviewer/inviter **or** active owner/admin of the **same** group (remittance: branch admin or HQ admin) OR staff.
- Crons: `CRON_SECRET` only.

---

## 10. Worker / drain contract (no browser claim)

1. Drain auth stays `CRON_SECRET`. Missing/wrong secret → 401. **No** cookie JWT drain.
2. Drain uses service_role SELECT/UPDATE only. After Cut 2 it **must not** need table INSERT.
3. Drain **must** keep `isAfricanPhoneNumber()` re-check before Africa's Talking (`NOTIFICATION_CHANNEL_AUDIT` / CLAUDE.md rule 11). Out of Cut 2 SQL; regression-tested as **no-send** (function call with fixture numbers, no AT HTTP).
4. Drain must **not** be changed to select `failed` or reset `attempts`.
5. Webhook may UPDATE `data` provider status fields only; must not set `status='queued'` on failed rows.
6. Staff UI SELECT stays. Staff UI UPDATE **removed** at SQL (policy drop + revoke).
7. No `FOR UPDATE SKIP LOCKED` / `processing` in Cut 2.

---

## 11. F0 / F3 / Cut 1 impact

| Surface | Cut 2 effect |
|---------|--------------|
| Cut 1 helpers / 00114 | **UNCHANGED**. Preconditions assert Cut 1 applied. |
| F3 `financial_core.can_manage_finances` | **SAFER OR UNCHANGED**. Cut 2 does not touch finance helpers. |
| F0 | **NOT TOUCHED**. |
| Payments / obligations | Producers keep reading them; no schema change. |
| `has_group_permission` | Not used as the queue INSERT gate (service_role RPC). Routes keep their own active owner/admin checks. |

If implementation broadens F3 or Cut 1 → **HOLD**.

---

## 12. Service / system behavior

| Path | After Cut 2 |
|------|-------------|
| Vercel cron producers | service_role → RPC |
| Vercel drain | service_role UPDATE only; `CRON_SECRET` |
| Meta webhook | service_role UPDATE `data` |
| Browser producer routes | JWT authorize → service_role → RPC |
| sms-sender | **C1 MUST** leave cookie/anon client **before/with** Layer A; service_role or bounded DEFINER (Layer B: RPC or skip). Free-form message + arbitrary phone must not stay on authenticated |
| `/api/whatsapp/send` overflow | service_role → RPC; allowlist only (no `generic`) |
| Supabase Realtime / client SDK | no INSERT |

---

## 13. Historical / preference / quiet-hours preservation

- Do not invent a rule that exited members cannot receive a receipt already keyed by `paymentId`.
- Invitation `user_id` NULL remains valid.
- Prefs fail-closed preserved (§6.4).
- Quiet hours: **defer-compatible, not drop** (§6.4).
- In-app `notifications` table and its unique `dedup_key` indexes are **out of Cut 2** except “do not drop them.”

---

## 14. Acceptance matrix (behavioral)

Execute on **disposable** Postgres + mocked service_role. **No** Meta / AT / Resend / drain-against-prod.

| ID | Actor | Action | Expect |
|----|-------|--------|--------|
| A1 | `authenticated` member JWT | PostgREST INSERT `whatsapp`/`payment_receipt` | **DENY** |
| A2 | `authenticated` staff JWT | same INSERT | **DENY** |
| A3 | `anon` | INSERT | **DENY** |
| A4 | `authenticated` staff | UPDATE `queued`→`sent` | **DENY** |
| A5 | `authenticated` | `TRUNCATE notifications_queue` | **DENY** |
| A6 | `service_role` | table INSERT | **ALLOW** after Layer A only (C2); **DENY** after Layer B |
| A7 | `service_role` | `enqueue_outbound_notification` allowlisted `payment_receipt` + keys | **inserted** `queued` |
| A8 | `service_role` | RPC unknown template `generic` | **denied** |
| A9 | `service_role` | RPC missing `groupId` on `welcome` | **denied** |
| A10 | `service_role` | RPC `subscription_expiring` without `groupId` but with billing keys | **inserted** |
| A11 | `service_role` | RPC `announcement` | **denied** |
| A12 | `service_role` | RPC duplicate `paymentId` (including existing `failed`) | **duplicate**; row unchanged |
| A13 | `service_role` | RPC `status` smuggled `sent` via `p_data` | INSERT still `queued`; cannot set sent via RPC |
| A14 | `authenticated` | `EXECUTE enqueue_outbound_notification` | **DENY** |
| A15 | `service_role` | UPDATE drain-shaped `queued`→`failed` | **ALLOW** (table UPDATE) |
| A16 | staff JWT | SELECT queue | **ALLOW** if `is_platform_staff()` |
| A17 | member JWT | SELECT queue | **DENY** |
| A18 | dual-group actor | RPC `groupId` A + `user_id` only in B | **denied** |
| A19 | invitation | RPC `member_invitation` `user_id` NULL + keys | **inserted** |
| A20 | push channel | RPC `push` | **denied** |

---

## 15. Regression matrix

| ID | Must remain |
|----|-------------|
| R1 | Cut 1 `is_active_group_member` / `get_my_active_group_ids` / replaced admin helpers unchanged |
| R2 | All §7.6 unique indexes present |
| R3 | `getEnabledChannels` fail-closed catch unchanged (implementation PR must not “fix” quiet hours by dropping) |
| R4 | Drain still requires `CRON_SECRET`; still skips non-African SMS **in code** |
| R5 | Staff SELECT policies both present |
| R6 | Announcement producer still unwired (`produceAnnouncementDeliveries` import count = 0) |
| R7 | PR #69/#70 unapplied; `to_regclass('public.notification_policies')` NULL |
| R8 | `00114` file hash unchanged |
| R9 | No new cron that selects `failed` |
| R10 | `isAfricanPhoneNumber` still imported in drain `processSms` |

---

## 16. Disposable rehearsal + no-send harness (never production)

**Sequence (R13-equivalent):** CONTRACT PASS → IMPLEMENT on dedicated branch → one forward-only file after `00114` → disposable apply → A1–A20 + R1–R10 → SHA freeze → founder prod auth → apply one → **read-only** postconditions.

Rehearsal does **not** precede implementation. This planning PR is docs only.

**No-send harness rules**

- Do **not** call drain HTTP on production or disposable with real provider keys.
- Set `AFRICASTALKING_API_KEY`, WhatsApp tokens, Resend keys **unset** in harness.
- Do **not** `UPDATE … SET status='queued'` on copied failed rows.
- Do **not** clone production queue PII to a laptop; use synthetic UUIDs.
- Prove A1–A6 without inserting attacker rows into production.
- Optional: local `tests/s0-cut2-notification-queue/` modeled on Cut 1 `tests/s0-cut1-active-authorization/` — **not created in this PR**.

---

## 17. Migration design rules

1. Exactly **one** new file: suggested name `supabase/migrations/00115_s0_p0b_cut2_notification_queue.sql` — **not authored here**.
2. Forward-only. Never edit `00001`–`00114`.
3. Transactional; `CUT2_ABORT` on precondition failure.
4. No `NOTICE` + skip.
5. No `DELETE FROM notifications_queue`.
6. No index rebuild.
7. `SET search_path TO ''` on new DEFINER functions; bodies `public.`-qualified.
8. Do not `GRANT` enqueue to `authenticated`.
9. Companion app (implementation branch only, not this PR): **C1 first** — `sms-sender.ts` off cookie/anon INSERT (service_role or bounded DEFINER) **before/with** Layer A. Layer B also requires `/api/whatsapp/send` overflow + every leftover service_role `.insert()` to use the enqueue RPC. Layer A alone does **not** require rewriting canonical `produce*` inserts (**C2**).
10. Do not edit `package.json` dependencies for Cut 2.

---

## 18. Forward-recovery plan

| Failure | Recovery |
|---------|----------|
| Migration ABORT mid-transaction | nothing committed |
| Applied Layer A before C1 sms-sender move | session SMS fallback queueing **dead**; **ABORT / roll forward C1** — do not re-open authenticated INSERT |
| Applied Layer B while producers still `.insert()` | service_role table INSERT denied → canonical queue dry; **roll forward RPC** (do not re-open authenticated INSERT; **C2** says Layer A alone would have survived) |
| Unique index unexpected duplicate at apply | ABORT (precondition); founder decides; **no** silent DELETE |
| Need to undo prod apply | **PITR / restore**, not a down-migration that re-creates the forge |
| Drain cannot INSERT | expected; drain must not INSERT |

No in-place “re-open `auth.uid() IS NOT NULL`” backout.

---

## 19. Cut 3 SEPARATION

Cut 3 = P0-C storage NULL-path fail-open **only**.

Cut 2 must **not**:

- edit `storage.objects` policies
- apply `00112`
- add `storage_path_group_id_v2` write denials
- touch `avatars` / `receipts` / `group-documents`

A Daybreak PASS on **this** PR does **not** authorize Cut 3 planning or implementation.

---

## 20. PR #69 / #70 SEPARATION + M2 / F3-06

### PR #69 and PR #70 (both OPEN DRAFT — untouched / unapplied)

| Item | PR #69 | PR #70 |
|------|--------|--------|
| State | **OPEN DRAFT** | **OPEN DRAFT** CREATE-NOT-APPLY |
| Head | `a8cdeaa98e6bb9e3a6cccaf815aa4ae4441b59a7` | `0f258726c9328ee0204f7b5dee9efceebe7265b9` |
| Branch | `product-consistency/notification-policy-foundation-v2-20260910` | `security/notification-policy-schema-20260910` |
| What it is | Pure policy foundation (`notification-policy.ts` + tests) | Unapplied `notification_policies` / triggers / occurrences schema |
| Cut 2 | **must not** merge, rebase onto, or apply | **must not** merge, rebase onto, or apply |
| Cut 2 enqueue allowlist | **static** template names — not #69 module, not #70 tables | same |
| `to_regclass('public.notification_policies')` | n/a (no table) | must remain **NULL** after Cut 2 apply |
| Requalification | after S0 P0 cuts, **separate** | after S0 P0 cuts, **separate** |

### M2 / F3-06

M2 notification foundation (quiet-hours `DEFER_UNTIL`, policy versioning, occurrence identity) is **after** S0 exit per PR #71 order. F3-06 is **after** M2. Cut 2 must not start either.

---

## 21. Daybreak handoff contract (authoritative)

**Daybreak handoff: READY FOR REVIEW.**  
**Implementation: NOT AUTHORIZED** until Daybreak **PASS**.  
Daybreak PASS authorizes **IMPLEMENTATION ON A DEDICATED BRANCH only**, **NOT** production apply, **NOT** drain invoke, **NOT** provider sends.

| Gate | Result |
|------|--------|
| Authority pins exact | PASS |
| Live INSERT analysis (Chief verbatim + repo origin) | PASS |
| Producer inventory classified; UNKNOWN = 0 named; fail-closed | PASS |
| Trusted-server-only; revoke authenticated direct INSERT | PASS (design freeze) |
| Tenant / recipient / template / payload authority named | PASS |
| Prefs fail-closed preserved; quiet hours defer-not-drop | PASS |
| Idempotency indexes UNCHANGED; failed **NO RETRY** | PASS |
| Worker service_role explicit; browser must not claim | PASS |
| Exact CREATE/REPLACE/REWRITE/REVOKE names | PASS — §7 |
| Producer-by-producer matrix (incl. announcement DORMANT) | PASS — §9 |
| Acceptance + no-send harness + disposable + forward-only after 00114 | PASS — §14–§17 |
| PR #69 / #70 SEPARATION; Cut 3 SEPARATION | PASS — §19–§20 |
| Cut 1 untouched; live migrations **29** / version `20260911183755` recorded | PASS |
| C1 sms-sender before/with INSERT revoke | PASS (hard gate named; not implemented here) |
| C2 domain producers survive policy drop iff service_role GRANT INSERT remains | PASS |
| C3 zero UI inserts; forge = PostgREST RLS + sms-sender session | PASS |
| No migration SQL / no app code / no prod apply in this PR | PASS |
| F3 | **SAFER OR UNCHANGED** |

**HOLD if** Daybreak finds an additional **wired** INSERT call-site not in §5, or demands `processing` enum / PR #69/#70 apply / failed-row retry / quiet-hours drop / Cut 1 edit / production drain / SQL-only policy drop while sms-sender still uses `@/lib/supabase/server`.

### 21.1 HOLD blockers (this freeze)

| ID | Blocker | Disposition |
|----|---------|-------------|
| H1 | Additional live INSERT site not in §5 | **NONE found** on tip `1693b806`. New site → HOLD |
| H2 | Need live re-query of grants/indexes | **Not required** — Chief inventory + C4 (migrations 29, Cut 1 version, INSERT policy, grants, no `group_id`, enum) |
| H3 | sms-sender cookie INSERT vs policy drop | **HARD GATE (C1)** — implementation ABORT if policy dropped first. Not an open Daybreak HOLD on this docs PR |
| H4 | `generic` + free-form message/phone on authenticated path | **Forge-adjacent** — must leave authenticated path (C1); Layer B DENY `generic` |
| H5 | Concurrent drain without claim | **OUT OF SCOPE** (P1); HOLD only if reviewer makes it Cut 2-mandatory |
| H6 | 00097 index apply-time vs S0-A log | Chief inventory **names** hosting/event/subscription unique indexes as live. Do not invent log row. Missing index at apply → `CUT2_ABORT` |
| H7 | Layer B revoke service_role INSERT while `produce*` still `.insert()` | **ABORT** — violates C2 survival condition; ship RPC in same PR or keep service_role GRANT INSERT |

**Open HOLD count for Daybreak: 0** (contract complete, including C1–C5). Implementation remains unauthorized.

---

## 22. Non-goals

- No application/runtime product code in **this** PR.
- No Cut 2 migration SQL file in **this** PR.
- No production SQL / MCP write / dashboard apply.
- No merge or apply of PR #69 / #70 / #71.
- No Cut 3 / M2 / F3-06 start.
- No WhatsApp / SMS / email / push send.
- No drain invoke against production.
- No retry of `failed` rows; no `failed`→`queued`.
- No edit of `00001`–`00114` or Cut 1 objects.
- No `package.json` dependency changes.
- No wiring of Build 8 announcement producer.
- No `notification_policies` / agentic intents.
- No `group_id` column add.
- No `processing` enum value.
- No global `is_group_member` change.
- No PITR / member / payment / storage mutation.

---

## 23. STOP rules

Stop and HOLD (do not improvise) if:

1. Pressure to implement Cut 2 / author `00115` / apply to `llbnliixczcqfftxpsmb` from this planning branch.
2. Request to send a “test” WhatsApp/SMS/email or drain production.
3. Request to retry failed queue rows.
4. Request to merge/apply PR #69, #70, or #71, or start Cut 3 / M2 / F3-06.
11. Request to DROP the INSERT policy / `REVOKE INSERT` from `authenticated` while `sms-sender.ts` still uses `@/lib/supabase/server` `createClient` for queue INSERT (C1).
12. Request to `REVOKE INSERT` from `service_role` while canonical `produce*` still `.insert()` without RPC (C2 / Layer B).
5. Request to edit Cut 1 / `00114`.
6. Live rehearsal discovers an extra INSERT call-site — **add it to §5**, do not drop ad hoc.
7. Request to re-open `auth.uid() IS NOT NULL` INSERT “temporarily.”
8. Request to GRANT enqueue RPC to `authenticated`.
9. Request to DROP unique indexes to “allow retry.”
10. Request to delete queued rows for quiet hours.

---

## Planning verdict (this artifact)

| Question | Answer |
|----------|--------|
| Sufficient for Daybreak PASS/HOLD without implementation? | **YES** |
| What is frozen | §21 + §7 object list + §5 inventory + §9 matrix |
| What is implemented | **NOTHING** |
| Next | Daybreak review → (if PASS) dedicated implementation branch |

**PASS — CUT 2 SECURITY CONTRACT COMPLETE; READY FOR DAYBREAK REVIEW.**
