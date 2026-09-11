# S0 P0-B Cut 2 — SECURITY REVISION 4 (Daybreak HOLD closeout)

**Date:** 2026-09-11  
**Status:** **SECURITY REVISION 4 — READY FOR DAYBREAK RE-REVIEW**  
**Overall recommended verdict:** **PASS — LAYER B ONLY; R1–R30 + R2 + R3 FROZEN; R4-1–R4-25 FROZEN**  
**Implementation:** **NOT AUTHORIZED** until Daybreak **PASS**. PASS authorizes **implementation on a dedicated branch only**, **NOT** production apply.  
**This PR:** docs / evidence only. **No** `00115` SQL. **No** runtime code.  
**Authoritative freeze:** this document (SR4). SR1–SR3 remain ancestry; conflicting SR3 sentences on unscoped WA uniques / duplicate lookup / 00115 atomic order are **superseded** by R4-1–R4-25.  
**Previous Daybreak-reviewed tip (MUST be ancestry):** `a806c3403f0723bb8e316919d72154b9dd52c890`  
**Evidence:**  
- `docs/evidence/S0_CUT2_NOTIFICATION_QUEUE_LIVE_INVENTORY_20260911.json`  
- `docs/evidence/S0_CUT2_DOMAIN_ENQUEUE_MATRIX_20260911.json`  
- `docs/evidence/S0_CUT2_CHANNEL_RENDERER_MATRIX_20260911.json`  
- `docs/evidence/S0_CUT2_IDEMPOTENCY_INDEX_MATRIX_20260911.json`  
- `docs/evidence/S0_CUT2_CHIEF_READONLY_SR2_FOLD_20260911.json`  
- `docs/evidence/S0_CUT2_FUTURE_CI_SCRIPT_NAMES_20260911.json`  
- `docs/evidence/S0_CUT2_PROVENANCE_QUARANTINE_CONTRACT_20260911.json`  
- `docs/evidence/S0_CUT2_LEGACY_WA_INDEX_PROVENANCE_MATRIX_20260911.json`

---

## Pins (do not drift)

| Pin | Value |
|-----|-------|
| This revision parent tip | `a806c3403f0723bb8e316919d72154b9dd52c890` |
| Production main | `1693b806beaf80d1c8101c8011874a2a2bcbb642` |
| Master PRD #71 freeze | `050be86c9df3455c66b27bb5853eb786228b4009` |
| Cut 1 CLOSED prod | version `20260911183755` name `s0_p0a_cut1_active_authorization` — **DO NOT MODIFY** |
| Repo | `https://github.com/gatekipa/villageclaq` |
| Planning branch / PR | `planning/s0-p0b-cut2-notification-queue-20260911` / DRAFT **#77** |
| PR #69 | OPEN DRAFT `a8cdeaa98e6bb9e3a6cccaf815aa4ae4441b59a7` — **untouched / unapplied** |
| PR #70 | OPEN DRAFT CREATE-NOT-APPLY `0f258726c9328ee0204f7b5dee9efceebe7265b9` — **untouched / unapplied** |
| Live project | `llbnliixczcqfftxpsmb` — migrations **29**; INSERT policy `Authenticated users can queue notifications` `WITH CHECK (auth.uid() IS NOT NULL)`; GRANT INSERT anon+authenticated+service_role; **no `group_id` column**; enum `queued\|sent\|failed` only |

---

## R1 — Layer B mandatory path (Layer A removed)

**Layer A is not an implementation option.** After Cut 2 there is one architecture:

```
BROWSER
  → authorized domain route / cron
    → domain producer (authz + load object + prefs)
      → service_role EXECUTE enqueue_outbound_notification(...)
        → notifications_queue (status=queued only)
          → trusted drain (CRON_SECRET + service_role SELECT/UPDATE)
            → provider (AT / Meta / Resend)
```

**Forbidden after Cut 2**

- Direct `notifications_queue` INSERT by `anon`, `authenticated`, platform-staff JWT, **or** `service_role` application producers.
- Browser `/api/sms/send` or `/api/whatsapp/send` (typed, direct Meta template, or text).
- `sms-sender.ts` cookie/anon INSERT (`generic` + free-form message + arbitrary phone).
- Cron `sendSmsNotification` / `dispatchWhatsApp` happy-path (except drain).

`service_role` table privileges after 00115: **SELECT + UPDATE only**. **EXECUTE** `enqueue_outbound_notification` only. **No** INSERT / DELETE / TRUNCATE.

---

## R2 — Exact `enqueue_outbound_notification` signature

```
public.enqueue_outbound_notification(
  p_notification_type         text,
  p_domain_object_id          uuid,
  p_channel                   public.notification_channel,
  p_recipient_membership_id   uuid     DEFAULT NULL,
  p_locale                    text     DEFAULT NULL
)
RETURNS TABLE (
  queue_id   uuid,
  result     text   -- 'inserted' | 'duplicate' | 'denied'
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
```

**Grants:** `REVOKE ALL FROM PUBLIC, anon, authenticated`. `GRANT EXECUTE TO service_role` only.

### Fail-closed rules (inside the function — no caller-trusted contact)

| Input | Rule |
|-------|------|
| `p_notification_type` | Must be in R4 type allowlist. Else `result='denied'`, no insert. |
| `p_channel` | Must be `whatsapp` \| `sms` \| `email`. `push` → denied. |
| `p_domain_object_id` | Required UUID. Function **loads** the domain row. Missing → denied. |
| `p_recipient_membership_id` | **Required** for fan-out types (R3 `fanout=true`). **NULL** for single-recipient types. Wrong/foreign membership → denied. |
| `p_locale` | `NULL` or `en` or `fr`. Anything else → denied. |
| **Rejected parameters (MUST NOT exist)** | phone, email, recipient text, free-form message, Meta `components`, `groupId`, `template`, `data` jsonb, `status`, `user_id` |

**Internal algorithm (order is mandatory)**

1. Allowlist `p_notification_type` + `p_channel`.
2. Load domain object by R3 table + `p_domain_object_id`.
3. **Derive tenant `group_id` from the object chain** (R3). **Do not trust** any caller `groupId`.
4. Resolve recipient membership (single-recipient: from object; fan-out: `p_recipient_membership_id` must belong to that tenant per R3).
5. **Derive recipient contact from DB** (R7). Never from args.
6. Prefs (R9): fail-closed. Invitation exception.
7. Allowlist queue `template` string (R4) and server-own content (R5).
8. INSERT `status='queued'` only and **hardcode `cut2_provenance_version=1`** (R3-4; not an arg). Unique conflict → `duplicate` (no UPDATE).
9. **Never** UPDATE/DELETE/requeue/replace a `failed` or `sent` row.

`denied` and `duplicate` return `queue_id` NULL (or existing id on duplicate — implementation may return existing id **read-only**; must not mutate).

---

## R3 — Domain resolution matrix (complete)

Machine-readable copy: `docs/evidence/S0_CUT2_DOMAIN_ENQUEUE_MATRIX_20260911.json`.  
**Unknown live named producers: 0.** Schema chains from repo producers + migrations on tip `1693b806`.

`fanout=true` ⇒ caller must pass `p_recipient_membership_id` of a membership that the chain accepts.

### 15 live named WhatsApp producers

| Type | Domain table | `p_domain_object_id` | Tenant chain (derived) | Recipient | Fan-out | Prefs key |
|------|--------------|----------------------|------------------------|-----------|---------|-----------|
| `payment_receipt` | `payments` | `payments.id` | `payments.group_id` (producer also asserts `memberships.group_id` = `payments.group_id`) | `payments.membership_id` | no | `payment_reminders` |
| `payment_reminder` | `contribution_obligations` (**not** `payment_obligations` — that table is **absent** live + repo) | `contribution_obligations.id` | `contribution_obligations.group_id` (assert = `memberships.group_id`) | `contribution_obligations.membership_id` (skip proxy / null `user_id`) | no | `payment_reminders` |
| `welcome` | `memberships` | `memberships.id` | `memberships.group_id` | same membership (`user_id` required) | no | `new_member` |
| `standing_changed` | `memberships` | `memberships.id` | `memberships.group_id` | same (`user_id` required; standing from `memberships.standing`) | no | `standing_changes` |
| `relief_enrollment` | `relief_enrollments` | `relief_enrollments.id` | **`plan_id` → `relief_plans.group_id`** (producer + live). Column `collecting_group_id` exists (nullable) — **not** the authz tenant. Assert `memberships.group_id` = plan tenant. | `relief_enrollments.membership_id` | no | `relief_updates` |
| `relief_claim_approved` | `relief_claims` | `relief_claims.id` | `relief_claims.plan_id` → `relief_plans.group_id` | `relief_claims.membership_id` | no | `relief_updates` |
| `relief_claim_denied` | `relief_claims` | `relief_claims.id` | same | same | no | `relief_updates` |
| `remittance_confirmed` | `relief_remittances` | `relief_remittances.id` | **`branch_group_id`** (live NOT NULL). **No** `group_id` / **no** `hq_group_id` on this table (live). `relief_plan_id` exists for content only — not tenant. | fan-out: active owner/admin membership of **branch** group, `user_id` NOT NULL | **yes** | `relief_updates` |
| `remittance_disputed` | `relief_remittances` | `relief_remittances.id` | same | same | **yes** | `relief_updates` |
| `hosting_assignment` | `hosting_assignments` | `hosting_assignments.id` | **No `group_id` on this table (live).** Authoritative: `roster_id` → `hosting_rosters.group_id` (producer). Alternate column: nullable `event_id` → `events.group_id`. If `event_id` set, `events.group_id` MUST equal roster tenant else **denied**. Missing roster → denied. | `hosting_assignments.membership_id` | no | `hosting_reminders` |
| `hosting_reminder` | `hosting_assignments` | `hosting_assignments.id` | same | same | no | `hosting_reminders` |
| `event_reminder` | `events` | `events.id` | `events.group_id` (`00003_events_operations_tables.sql`) | fan-out: active non-proxy memberships of that group, `user_id` NOT NULL (producer L149–155; **not** `event_attendances`) | **yes** | `event_reminders` |
| `loan_approved` | `loans` | `loans.id` | `loans.group_id` (assert = `memberships.group_id`) | `loans.membership_id` | no | `loan_updates` |
| `loan_overdue` | `loans` | `loans.id` | `loans.group_id` | `loans.membership_id` (amount/due from `loan_schedule` overdue rows — content only) | no | `loan_updates` |
| `fine_issued` | `fines` | `fines.id` | `fines.group_id` (`00010_stickiness_features.sql`; assert = `memberships.group_id`) | `fines.membership_id` | no | `fine_updates` |
| `member_invitation` | `invitations` | `invitations.id` | `invitations.group_id` (live NOT NULL) | **invitee phone = `invitations.phone`** (DB); `user_id` NULL | no | **none (R9)** |
| `subscription_expiring` | `group_subscriptions` | `group_subscriptions.id` | **GROUP-SCOPED** — `group_subscriptions.group_id` (producer reads only `id, group_id, status, current_period_end`; live `group_id` NOT NULL UNIQUE). **Not** a platform-user subscription. | fan-out: active non-proxy owner/admin of that group | **yes** | `subscription_updates` |

Claim/remittance **type** is derived from authoritative `status` on the loaded row (`approved`/`denied`, `confirmed`/`disputed`). Caller must pass the matching `p_notification_type`; mismatch with row status → **denied**.

### Additional live SMS/WhatsApp paths (not among the 15 queue producers today)

| Type | Domain table | Tenant chain | Recipient | Fan-out | Live source |
|------|--------------|--------------|-----------|---------|-------------|
| `minutes_published` | `meeting_minutes` | `meeting_minutes.group_id` (`00003_events_operations_tables.sql`) | active-ish members of group (today: `standing <> banned`, `user_id` set) — **Cut 2: active membership + `user_id` NOT NULL** | yes | `minutes/page.tsx` → notify-client |
| `election_opened` | `elections` | `elections.group_id` (`00009_phase9_features.sql`) | group members with `user_id` | yes | `elections/page.tsx` → notify-client |
| `announcement` | `announcements` | `announcements.group_id` (`00008_communications_tables.sql`) | audience JSON (all/roles/members) — **RPC loads announcement + resolves audience from DB, not client recipient list** | yes | `announcements/page.tsx` + cron `send-scheduled-announcements` |
| `proxy_claim` | `memberships` | `memberships.group_id` | **same proxy membership**; contact from `privacy_settings.proxy_phone` \|\| `memberships.phone` — **ignore request-body phone** | no | `proxy-claim/send` + `members/page.tsx` |
| `hosting_swap` | `hosting_swap_requests` | `from_assignment_id` → `hosting_assignments.roster_id` → `hosting_rosters.group_id` (`00003_events_operations_tables.sql`) | request: owner/admins; approve/reject: membership of `requested_by` | yes for request | `hosting/page.tsx` swap flows (today misuses `hosting_reminder` for request+approve; reject is email/in-app only) |

`announcement-producer.ts` remains **DORMANT** (00106/00107). Cut 2 still enqueues `announcement` via RPC from cron/page conversion — **does not** apply 00106/00107.

**Producer-validates is not a substitute.** Every row above has an explicit table.column chain.

### Live prod tenant columns (READ-ONLY MCP `llbnliixczcqfftxpsmb`, 2026-09-11)

Confirmed present: `payments.group_id`, `fines.group_id`, `loans.group_id`, `invitations.group_id`, `memberships.group_id` + `membership_status`, `announcements.group_id`, `events.group_id`, `hosting_rosters.group_id`, `relief_plans.group_id`, `group_subscriptions.group_id`, `contribution_obligations.group_id`, `meeting_minutes.group_id`, `elections.group_id`, `relief_remittances.branch_group_id`, `relief_claims.plan_id`, `relief_enrollments.plan_id` + nullable `collecting_group_id`, `hosting_assignments.roster_id` + nullable `event_id` (**no** `group_id`).

**Absent:** `public.payment_obligations` (`to_regclass` NULL). Reminder domain table is **`contribution_obligations`**.

`data.groupId` is **never** an authorization source. RPC may emit derived `groupId` in `data` only **after** the chain above.

---

## R4 — Type + channel + template allowlists

### `p_notification_type` (enqueue)

`payment_receipt`, `payment_reminder`, `welcome`, `standing_changed`, `relief_enrollment`, `relief_claim_approved`, `relief_claim_denied`, `remittance_confirmed`, `remittance_disputed`, `hosting_assignment`, `hosting_reminder`, `event_reminder`, `loan_approved`, `loan_overdue`, `fine_issued`, `member_invitation`, `subscription_expiring`, `minutes_published`, `election_opened`, `announcement`, `proxy_claim`, `hosting_swap`

**Not allowlisted:** `generic`, `invitation` (legacy MARKETING), `payment-pending`, `push`, arbitrary strings.

### Channel (SR2 — DEFAULT DENY)

**Not** “all channels.” Per type×channel ALLOW/DENY is in `S0_CUT2_CHANNEL_RENDERER_MATRIX_20260911.json`. `push` = **DENY** for every type. SQL RPC denies a channel that is not ALLOW.

### Queue `template` column (written by RPC, not caller)

Equals `p_notification_type` (underscore form). SMS does **not** use hyphenated `SmsTemplate` in the queue row.

### SMS semantic renderers (server-owned — no raw browser message)

From `src/lib/notifications/sms-templates.ts` + `send-sms-notification.ts` `buildMessage` switch. Queue/RPC uses **underscore** type; hyphenated ids are live `SmsTemplate` aliases only (not RPC params).

| RPC type | Semantic function | Live `SmsTemplate` alias |
|----------|-------------------|--------------------------|
| `payment_reminder` | `paymentReminderSms` | `payment-reminder` |
| `event_reminder` | `eventReminderSms` | `event-reminder` |
| `payment_receipt` | `paymentReceiptSms` | `payment-receipt` |
| `welcome` | `welcomeSms` | `welcome` |
| `minutes_published` | `minutesPublishedSms` | `minutes-published` |
| `hosting_reminder` / `hosting_swap` | `hostingReminderSms` | `hosting-reminder` |
| `standing_changed` | `standingChangedSms` | `standing-changed` |
| `hosting_assignment` | `hostingAssignmentSms` | `hosting-assignment` |
| `relief_enrollment` | `reliefEnrollmentSms` | `relief-enrollment` |
| `remittance_confirmed` / `remittance_disputed` | `remittanceStatusSms` | `remittance-status` |
| `subscription_expiring` | `subscriptionExpiringSms` | `subscription-expiring` |
| `relief_claim_approved` | `reliefClaimApprovedSms` | `relief-claim-approved` |
| `relief_claim_denied` | `reliefClaimDeniedSms` | `relief-claim-denied` |
| `announcement` | `announcementSms` | `announcement` |
| `loan_approved` | `loanApprovedSms` | `loan-approved` |
| `fine_issued` | `fineIssuedSms` | `fine-issued` |
| `proxy_claim` | `proxyClaimSms` | `proxy-claim` |
| `member_invitation` | *(no dedicated renderer today — Cut 2 adds server render from invitation row)* | — |
| `loan_overdue` | *(no dedicated renderer today — Cut 2 adds server render from loan row)* | — |
| `election_opened` | *(no dedicated renderer today — Cut 2 adds server render from election row)* | — |

**Not allowlisted:** `paymentPendingSms` / `payment-pending` (DORMANT). **No** caller-supplied `message` string.

### Meta template names (drain / R5)

From `src/lib/whatsapp-templates.ts` `WA_TEMPLATES` / `whatsapp-dispatcher.ts` `TYPE_TO_TEMPLATE`:

| Type | Meta name |
|------|-----------|
| `payment_receipt` | `villageclaq_payment_receipt_v2` |
| `payment_reminder` | `villageclaq_payment_reminder_v2` |
| `event_reminder` | `villageclaq_event_reminder` |
| `hosting_reminder` / `hosting_assignment` | `villageclaq_hosting_reminder` |
| `minutes_published` | `villageclaq_minutes_published` |
| `relief_claim_approved` | `villageclaq_relief_claim_approved` |
| `relief_claim_denied` | `villageclaq_relief_claim_denied` |
| `announcement` | `villageclaq_announcement_v2` |
| `election_opened` | `villageclaq_election_opened` |
| `invitation` (legacy MARKETING) | `villageclaq_invitation` — **NOT allowlisted** |
| `member_invitation` | `villageclaq_member_invitation_notice` |
| `loan_approved` | `villageclaq_loan_approved` |
| `loan_overdue` | `villageclaq_loan_overdue` |
| `fine_issued` | `villageclaq_fine_issued` |
| `standing_changed` | `villageclaq_standing_changed` |
| `welcome` | `villageclaq_member_joined` |
| `relief_enrollment` | `villageclaq_plan_enrollment_confirmed` |
| `remittance_confirmed` | `villageclaq_remittance_confirmed` |
| `remittance_disputed` | `villageclaq_remittance_disputed` |
| `subscription_expiring` | `villageclaq_account_access_notice` |
| `proxy_claim` | `villageclaq_proxy_claim` |
| `hosting_swap` | `villageclaq_hosting_reminder` (same Meta body as hosting reminder) |

---

## R5 — Canonical semantic envelope (SQL does **not** render) — SR2

**SQL RPC does not render SMS/email/WhatsApp.** It never depends on `sms-templates.ts`. Cron does **not** pre-render SMS.

RPC writes `template = p_notification_type` and `data` = **CANONICAL SEMANTIC ENVELOPE** only:

| Key | Source | Freshness |
|-----|--------|-----------|
| `envelopeVersion` | literal `2` | A snapshot |
| `cut2Semantic` | literal `true` | A snapshot — **required on every NEW Cut 2 row** |
| `notification_type` | `p_notification_type` | A snapshot |
| `domain_object_id` | `p_domain_object_id` | A snapshot |
| `derived_group_id` | R3 chain (also copied to `groupId` for legacy readers) | A snapshot — **not authz** |
| `recipient_membership_id` | derived or `p_recipient_membership_id` | A snapshot |
| `recipient_user_id` | `memberships.user_id` or NULL | A snapshot |
| `idempotencyKey` | R2-E expression | A snapshot |
| `locale` | `p_locale` if `en`/`fr`, else NULL | A snapshot if passed; else drain B-reloads `profiles.preferred_locale` |
| type-specific IDs | `paymentId`, `obligationId`, `reminderDate`, … | **A snapshot** (part of key / identity) |
| display names, amounts, titles, Meta body vars | **not written by RPC** | **B reload** in drain from domain row |
| phone / email | **not used as send authority from envelope** | **B reload** at drain (R7 / email source). If reload empty → fail that attempt (no snapshot send) |
| `claimUrl` (proxy_claim only) | token created in the **authorized route** before RPC; route may pass… **NO** — RPC must not accept URL. Drain B-reloads latest unclaimed `proxy_claim_tokens.token` for that membership and builds URL | B reload |
| `message`, `components`, `whatsappData` | **forbidden on Cut 2 rows** | — |

### Drain TODAY (`drain-notification-queue/route.ts` on tip `1693b806`) — must change for Cut 2 NEW rows

| Channel | Today | Cut 2 NEW rows |
|---------|-------|----------------|
| SMS | `processSms` uses **`data.message` only**. Comment: “SMS payload is pre-rendered at enqueue time … cannot be re-localized.” | **MUST NOT** use `data.message`. Drain selects semantic SMS renderer from `template = notification_type` + envelope. |
| Email | `data.template` + `data.emailData` via `sendEmail` | Drain selects frozen `EmailTemplate` from `notification_type`. **No** caller/`data.template`. |
| WhatsApp | prefers `data.whatsappType`+`whatsappData` dispatcher; else raw `data.template` Meta | Typed dispatcher **only**. **No** raw Meta from queue. |

**~~Legacy discriminator (SR2) — SUPERSEDED by R3-5 / R3-6.~~**  
SR2 used `data.cut2Semantic` / `idempotencyKey` / `template` as a semantic-vs-legacy branch. **That is NOT trust evidence.** After 00115 the **only** trusted discriminator is the table column `cut2_provenance_version = 1` (R3-1–R3-8). NULL provenance is quarantined and **must not** take the legacy raw `data.message` / `template` / `components` path.

NEW Cut 2 rows **must not** write `data.message`, `data.components`, or caller `data.template` (email/Meta). Envelope fields remain snapshots for render/idempotency only.

---

## R6–R8 — Tenant / recipient / subscription

- **Tenant** is always derived (R3). Caller `groupId` is not a parameter.
- **Recipient membership** must sit on that tenant (`memberships.group_id` = derived tenant), except `member_invitation` (no membership) and remittance (branch group, not HQ).
- **Contact derivation (R7)** — standard chain proven in producers:  
  proxy: `privacy_settings.proxy_phone` \|\| `memberships.phone`  
  else: `profiles.phone` \|\| `memberships.phone` \|\| `proxy_phone` \|\| `auth.users.phone`  
  invitation: **`invitations.phone` only**.  
  remittance: `profiles.phone` \|\| `auth.users.phone` (producer has no proxy path).  
  `proxy_claim`: proxy chain on the **target** membership; **not** request body.
- **`subscription_expiring`:** tenant = `group_subscriptions.group_id` (migration `00050`). Recipients = that group’s active owner/admins. **Not** a platform-user subscription table. Do not invent a platform tenant.

---

## R9 — Prefs fail-closed

- Location: `getEnabledChannels()` / `get_notification_preferences(p_user_id)` (`00054` + `src/lib/notification-prefs.ts`).
- On prefs-read **error** for a real user: external channels **false**.
- RPC must implement the **same fail-closed** (must **not** copy event/subscription producer try/catch fail-**open** at `event-reminder-producer.ts` L350–359 / `subscription-expiring-producer.ts` L358–367).
- **Invitation exception:** no profile; skip prefs; WhatsApp/SMS to `invitations.phone` if present.
- Quiet hours: stored, not enforced. Cut 2 **does not drop** rows. M2 may `DEFER_UNTIL`.
- In-app remains always-on for real users (out of queue RPC).

---

## R10 — Idempotency (FAILED = terminal) — SR2 canonical key

**ONE** mechanism: RPC writes `data.idempotencyKey` (expressions in `S0_CUT2_IDEMPOTENCY_INDEX_MATRIX_20260911.json`). Future unique index (PLAN text only — **do not author a migration file**):

```sql
CREATE UNIQUE INDEX idx_notifications_queue_cut2_semantic_idempotency_unique
ON public.notifications_queue (channel, template, ((data ->> 'idempotencyKey')))
WHERE cut2_provenance_version = 1
  AND NULLIF(BTRIM(data ->> 'idempotencyKey'), '') IS NOT NULL;
```

**SR3 revise (R3-16 / R3-17):** trusted-only predicate `cut2_provenance_version = 1` on the **canonical** index. No status filter — queued, sent, **and** failed trusted rows participate. Legacy / NULL-provenance keys **cannot** occupy or poison this index.

**SR4 SUPERSEDES “preserve unscoped WA uniques / do not DROP”.** All 17 live WhatsApp unique indexes are **DROP + CREATE same name** with `AND cut2_provenance_version = 1` (R4-1–R4-9). Names, key expressions, and existing template/channel/data predicates stay exact.

**SR4 duplicate contract (R4-10–R4-14) SUPERSEDES** “on unique conflict return any existing id”: lookup **ONLY** `cut2_provenance_version=1` + `channel` + `template` + canonical `idempotencyKey`. NULL legacy is **never** returned as `duplicate`/`queue_id`. Conflict without a matching trusted canonical row → `trusted_idempotency_conflict_mismatch` (no mutation).

Existing unique indexes (do not DROP). Legacy WA conflict keys remain as a second backstop:

| Status already present | Re-enqueue same key |
|------------------------|---------------------|
| `queued` | `duplicate` — no UPDATE |
| `sent` | `duplicate` — no UPDATE |
| `failed` | `duplicate` — **NO UPDATE / DELETE / REQUEUE / REPLACEMENT** |

Indexes (WhatsApp; SMS/email use **new** unique indexes in 00115 with same keys + `channel`):

| Type | Index | Conflict keys |
|------|-------|---------------|
| `payment_receipt` | `idx_notifications_queue_whatsapp_payment_receipt_unique` | `data.paymentId` |
| `welcome` | `…_welcome_unique` | `data.membershipId` |
| `relief_enrollment` | `…_relief_enrollment_unique` | `data.enrollmentId` |
| `hosting_assignment` | `…_hosting_assignment_unique` | `data.assignmentId` |
| `payment_reminder` | `…_payment_reminder_unique` | `obligationId`,`reminderDate` |
| `standing_changed` | `…_standing_changed_unique` | `membershipId`,`newStanding`,`changeDate` |
| `fine_issued` | `…_fine_issued_unique` | `fineId` |
| `loan_approved` | `…_loan_approved_unique` | `loanId` |
| `relief_claim_approved` | `…_claim_approved_unique` | `claimId` |
| `relief_claim_denied` | `…_claim_denied_unique` | `claimId` |
| `member_invitation` | `…_member_invitation_unique` | `invitationId`,`sendDate` |
| `loan_overdue` | `…_loan_overdue_unique` | `loanId`,`reminderDate` |
| `remittance_confirmed` | `…_remittance_confirmed_unique` | `remittanceId`,`recipientUserId` |
| `remittance_disputed` | `…_remittance_disputed_unique` | `remittanceId`,`recipientUserId` |
| `hosting_reminder` | `…_hosting_reminder_unique` | `assignmentId`,`assignedDate` |
| `event_reminder` | `…_event_reminder_unique` | `eventId`,`userId` |
| `subscription_expiring` | `…_subscription_expiring_unique` | `subscriptionId`,`reminderDate`,`userId` |

00115 **CREATE UNIQUE INDEX IF NOT EXISTS** (same key + channel) for `sms`/`email` twins, plus new types: `minutes_published` (`minutesId`,`userId`), `election_opened` (`electionId`,`userId`), `announcement` (`announcementId`,`userId`,`channel`), `proxy_claim` (`membershipId`), `hosting_swap` (`swapRequestId`,`userId`,`decision`). Missing expected live WhatsApp index at apply → `CUT2_ABORT`.

---

## R11–R16 — Close browser-reachable arbitrary relays (including direct Meta)

Chief interim evidence verified on tip `1693b806` + live READ-ONLY MCP. Generic `{to, template, data}` / free-form Meta is **Daybreak FAIL**.

### 1. `POST /api/sms/send` — generic relay (FAIL)

**Live body:** `{to, template, data, locale?}`. JWT + `callerCanMessageTarget`. Arbitrary phone **or** UUID + `SmsTemplate` + free-form `data`. Direct AT via `sendSmsNotification` → `sms-sender.ts` `sendSMS({to, message})`.

**Direct browser/lib callers (exact):**

1. `src/lib/notify-client.ts` (`notifyFromClient`, `notifyBulkFromClient`)
2. `src/lib/calculate-standing.ts`
3. `src/app/[locale]/(dashboard)/dashboard/my-invitations/page.tsx`
4. `src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx`

**notify-client importers (SMS and/or WhatsApp via the generic relays):**

5. `src/components/payments/pay-now-dialog.tsx`
6. `src/app/[locale]/(dashboard)/dashboard/fines/page.tsx`
7. `src/app/[locale]/(dashboard)/dashboard/loans/page.tsx`
8. `src/app/[locale]/(dashboard)/dashboard/relief/claims/page.tsx`
9. `src/app/[locale]/(dashboard)/dashboard/relief/remittances/page.tsx`
10. `src/app/[locale]/(dashboard)/dashboard/relief/enrollment/page.tsx`
11. `src/app/[locale]/(dashboard)/dashboard/announcements/page.tsx`
12. `src/app/[locale]/(dashboard)/dashboard/minutes/page.tsx`
13. `src/app/[locale]/(dashboard)/dashboard/hosting/page.tsx`
14. `src/app/[locale]/(dashboard)/dashboard/elections/page.tsx`

**Disposition (SINGULAR — no optionality):** **`410 GONE`**. Remove the generic relay. No AT, no queue, no UUID→phone, no remaining `{to, template, data}`.

**Exact replacement path per current caller:**

| Current caller | Today | Replacement (ids only) |
|----------------|-------|------------------------|
| `src/lib/notify-client.ts` SMS `fetch("/api/sms/send")` | `{to, template, data}` | **Delete** those fetches. Importers call domain `*-notifications` routes. |
| `src/lib/calculate-standing.ts` L783 | `postJson("/api/sms/send", standing-changed)` | **Remove.** Already posts `/api/members/standing-notifications` (L795). That route enqueues ALLOW channels (`standing_changed` SMS+WA; email DENY). |
| `src/app/.../contributions/record/page.tsx` L368 | `fetch("/api/sms/send", payment-receipt)` | **Remove.** Already calls `/api/payments/receipt-notifications` (L248). That route enqueues ALLOW channels. |
| `src/app/.../my-invitations/page.tsx` L276 | `fetch("/api/sms/send", welcome)` | **Remove.** Use `/api/members/welcome-notifications` (already used for WA via `requestWelcomeWhatsApp`). |

### 2. `POST /api/whatsapp/send` — typed + direct Meta + overflow (FAIL)

**Three server branches** (all browser-reachable with JWT):

| Branch | Body | Live browser caller |
|--------|------|---------------------|
| Typed | `{to, type, data, locale}` | `notify-client.ts` **and** announcements / minutes / elections / hosting / relief / loans / fines pages via that helper |
| **Direct Meta template** | `{to, template, language, components}` | **none** (capability OPEN — still a forge) |
| **Direct text** | `{to, text}` | **none** (capability OPEN — still a forge) |

Overflow + retryable provider failure: `queueWhatsAppMessage` **service_role INSERT** (arbitrary `type`/`template`/`components`/`text` into `data`). Closes **both** direct Meta send **and** queue overflow.

**Raw Meta callers today (repo):**

| File | Call |
|------|------|
| `src/lib/whatsapp-dispatcher.ts` | `sendWhatsAppMessage` |
| `src/app/api/whatsapp/send/route.ts` | `dispatchWhatsAppWithResult` + `sendWhatsAppMessage` + `sendWhatsAppText` |
| `src/app/api/cron/drain-notification-queue/route.ts` | `dispatchWhatsAppWithResult` + `sendWhatsAppMessage` (can replay `data.components`) |
| `src/app/api/proxy-claim/send/route.ts` | `dispatchWhatsApp` |
| `src/app/api/cron/send-scheduled-announcements/route.ts` | `dispatchWhatsApp` |

**After Cut 2:** raw Meta **only** from the drain cron (trusted `CRON_SECRET`). Dispatcher may remain as a **drain-only** helper. Any other raw Meta caller must be **explicitly justified server-only** in the implementation PR — default is remove.

**Disposition:** **CLOSE all three branches → 410.** No remaining WhatsApp HTTP send path.

### 3. `POST /api/proxy-claim/send`

**Caller:** `src/app/[locale]/(dashboard)/dashboard/members/page.tsx`.  
**Today:** cookie session; owner/admin role check; body `{membershipId, email, phone, channels}`. Direct `sendSmsNotification` + `dispatchWhatsApp` + Resend using **request-body** phone/email. `generateClaimToken` writes `proxy_claim_tokens.email/phone` from those same caller fields. **Does not** check `memberships.membership_status = 'active'` (Cut 1 column exists live).

**Disposition:**

- Bind **ACTIVE** membership (`membership_status = 'active'`, Cut 1) + `is_proxy` + `user_id IS NULL`.
- Authoritative records: `memberships` (domain) + server-created `proxy_claim_tokens` (claim). Token contact columns are written from **DB-derived** membership phone/email only.
- **No** caller-supplied contact as authority. Request `phone`/`email` ≠ DB → use DB or **denied** (A20).
- Enqueue `proxy_claim` + channel via RPC. **No** `dispatchWhatsApp` / `sendSmsNotification`.

### sms-sender chain (R12)

```
send-sms-notification.ts (SmsTemplate + data → semantic renderer)
  → sms-sender.ts sendSMS({to, message})
      → Africa's Talking  OR  cookie/anon notifications_queue INSERT template=generic
```

**Live users of this chain:** `/api/sms/send`, `proxy-claim/send`, crons `payment-reminders`, `event-reminders`, `hosting-reminders`, `subscription-reminders`, `send-scheduled-announcements`.

**After Layer B:** `sendSMS` is a **private transport** under domain producers / drain only. **No** free-form browser path. Queue only via `enqueue_outbound_notification`. sms-sender **must not INSERT**. Cron happy path = RPC `p_channel='sms'` (or `announcement`), not `sendSmsNotification`.

### Frozen dispositions (summary)

| Surface | After Cut 2 |
|---------|-------------|
| `/api/sms/send` | **`410 GONE` only.** No domain-bound conversion of this route. |
| `/api/whatsapp/send` | **CLOSE** typed + **direct Meta** + **text** + overflow INSERT. **410**. |
| `notify-client.ts` SMS/WA fetches | **Remove**. Pages call domain `*-notifications` / new typed enqueue routes with **ids only**. |
| `sms-sender.ts` | Private AT transport. **No queue INSERT**. Not called from browser. |
| `send-sms-notification.ts` | Not a browser/cron enqueue API. Semantic renderers reused **inside** RPC/drain. |
| `proxy-claim/send` | ACTIVE membership + proxy + null `user_id`; enqueue `proxy_claim`; DB contact only. |
| Cron SMS | RPC `p_channel='sms'`. **No** `sendSmsNotification`. |
| `send-scheduled-announcements` | Enqueue `announcement`; **no** `dispatchWhatsApp`. |
| Drain | Only remaining raw Meta + AT client; `CRON_SECRET`; no INSERT. |

---

## R17–R18 — Producer conversion + exact app file list

Every `produce*` stops `.from("notifications_queue").insert`. They call the dual-compat adapter (R27) with RPC args only.

**Exact files (no “etc.”)**

### Adapter (new on implementation branch — not this PR)

- `src/lib/enqueue-outbound-notification.ts`

### Producer modules (15)

- `src/lib/payment-receipt-producer.ts`
- `src/lib/payment-reminder-producer.ts`
- `src/lib/welcome-producer.ts`
- `src/lib/standing-change-producer.ts`
- `src/lib/relief-enrollment-producer.ts`
- `src/lib/relief-claim-decision-producer.ts`
- `src/lib/remittance-decision-producer.ts`
- `src/lib/hosting-assignment-producer.ts`
- `src/lib/hosting-reminder-producer.ts`
- `src/lib/event-reminder-producer.ts`
- `src/lib/loan-approved-producer.ts`
- `src/lib/loan-overdue-producer.ts`
- `src/lib/fine-issued-producer.ts`
- `src/lib/member-invitation-producer.ts`
- `src/lib/subscription-expiring-producer.ts`

### Domain routes (keep JWT/CRON authz; pass ids only)

- `src/app/api/payments/receipt-notifications/route.ts`
- `src/app/api/members/welcome-notifications/route.ts`
- `src/app/api/members/standing-notifications/route.ts`
- `src/app/api/relief/enrollment-notifications/route.ts`
- `src/app/api/relief/claim-notifications/route.ts`
- `src/app/api/relief/remittance-notifications/route.ts`
- `src/app/api/hosting/assignment-notifications/route.ts`
- `src/app/api/invitations/whatsapp-notifications/route.ts`
- `src/app/api/loans/approval-notifications/route.ts`
- `src/app/api/fines/issued-notifications/route.ts`
- `src/app/api/cron/payment-reminders/route.ts`
- `src/app/api/cron/event-reminders/route.ts`
- `src/app/api/cron/hosting-reminders/route.ts`
- `src/app/api/cron/subscription-reminders/route.ts`
- `src/app/api/cron/loan-overdue-reminders/route.ts`
- `src/app/api/cron/send-scheduled-announcements/route.ts`
- `src/app/api/cron/drain-notification-queue/route.ts` (no INSERT; keep UPDATE)
- `src/app/api/webhooks/whatsapp/route.ts` (UPDATE `data` only)
- `src/app/api/proxy-claim/send/route.ts`
- `src/app/api/sms/send/route.ts` (**close**)
- `src/app/api/whatsapp/send/route.ts` (**close**)

### Relay / client conversion

- `src/lib/notifications/sms-sender.ts`
- `src/lib/send-sms-notification.ts`
- `src/lib/notify-client.ts`
- `src/lib/calculate-standing.ts`
- `src/lib/notify-welcome.ts`
- `src/lib/notify-money-path.ts`
- `src/lib/notify-hosting-assignment.ts`
- `src/lib/notify-relief-enrollment.ts`
- `src/lib/notify-member-invitation.ts`
- `src/components/payments/pay-now-dialog.tsx`
- `src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx`
- `src/app/[locale]/(dashboard)/dashboard/my-invitations/page.tsx`
- `src/app/[locale]/(dashboard)/dashboard/fines/page.tsx`
- `src/app/[locale]/(dashboard)/dashboard/loans/page.tsx`
- `src/app/[locale]/(dashboard)/dashboard/relief/claims/page.tsx`
- `src/app/[locale]/(dashboard)/dashboard/relief/remittances/page.tsx`
- `src/app/[locale]/(dashboard)/dashboard/relief/enrollment/page.tsx`
- `src/app/[locale]/(dashboard)/dashboard/announcements/page.tsx`
- `src/app/[locale]/(dashboard)/dashboard/minutes/page.tsx`
- `src/app/[locale]/(dashboard)/dashboard/hosting/page.tsx`
- `src/app/[locale]/(dashboard)/dashboard/elections/page.tsx`
- `src/app/[locale]/(dashboard)/dashboard/members/page.tsx`

**Do not wire:** `src/lib/announcement-producer.ts` (DORMANT).  
**No `package.json` dependency edits.**

New enqueue routes (implementation may add, names frozen):  
`/api/minutes/published-notifications`, `/api/elections/opened-notifications`, `/api/announcements/enqueue`, `/api/hosting/swap-notifications` — JWT + domain id only.

---

## R19–R23 — DB privileges, DEFINER, status, drain, webhook

| Role | SELECT | INSERT | UPDATE | DELETE/TRUNCATE | EXECUTE enqueue |
|------|--------|--------|--------|-----------------|-----------------|
| `anon` | DENY | DENY | DENY | DENY | DENY |
| `authenticated` (incl. staff JWT) | staff SELECT policies only | DENY | DENY | DENY | DENY |
| `service_role` | GRANT | **DENY** | **COLUMN-LEVEL only (R3-12)** | DENY | **GRANT** |
| `postgres` | owner | owner (00115 only) | owner | owner | owner |

- DROP policies: `Authenticated users can queue notifications`, `Staff can update notification queue`.
- KEEP SELECT: `Platform staff can view all notifications_queue`, `Staff can view notification queue`.
- DEFINER: `SET search_path TO ''`; bodies `public.`-qualified; no `auth.uid()` tenant trust.
- Status enum **unchanged** (`queued|sent|failed`). **No** `processing`.
- Drain: `CRON_SECRET`; after 00115 SELECT **`status='queued' AND cut2_provenance_version=1` only**; UPDATE only worker columns in R3-12; **no INSERT**; keep `isAfricanPhoneNumber` before AT; **do not** select `failed` or NULL-provenance rows.
- Webhook: Meta signature; queue UPDATE **`data` only** (lookup by `data.providerMessageId`); must not set `status='queued'` on failed rows; **must not** UPDATE `cut2_provenance_version`. INSERT into `whatsapp_message_status_events` is a **separate table** — out of Cut 2 queue privilege scope.
- **SR3 UPDATE grants (R3-12 Chief-verified on `1693b806`):** REVOKE broad `service_role` UPDATE. GRANT UPDATE only on `status`, `error_message`, `attempts`, `sent_at`, `data`. **MUST NOT** UPDATE `cut2_provenance_version`, `channel`, `template`, `user_id`, `created_at`, `id`.

---

## R24–R26 — Tests + no-send

Disposable Postgres + mocked service_role. **No** Meta / AT / Resend / prod drain.

Must include: A1–A5 client INSERT/UPDATE/TRUNCATE DENY; A6 service_role table INSERT DENY; A7 RPC allowlisted type+channel inserted; A8 unknown type denied; A8b DENY channel for that type denied (no row); A9 missing domain row denied; A10 fan-out without membership denied; A11 foreign membership denied; A12 `groupId` smuggle impossible; A13 phone param impossible; A14 invitation NULL user inserted (WA/email if `invitations.email` present); A15 failed-row re-enqueue → existing id + `duplicate` (no UPDATE); A16 authenticated EXECUTE denied; A17 staff UPDATE denied; A18 **`/api/sms/send` any body → 410**; A19 `/api/whatsapp/send` typed **and** `{template,components}` **and** `{text}` **410**; A20 proxy-claim request phone ≠ DB phone → enqueue uses DB or denied; A21 proxy-claim target membership not `active` → denied; A22 proxy **actor** `role=moderator` DENY; A23 actor `role=member` DENY; A24 actor `membership_status=pending_approval` DENY; A25 actor `suspended` DENY; A26 actor `exited` DENY; A27 actor `archived` DENY; A28 email enqueue with `profiles.email` (column absent) impossible — source is `auth.users.email` or `invitations.email`; A29 `proxy_claim` + `p_channel=email` → denied; A30 `loan_overdue`/`election_opened`/`member_invitation` + `p_channel=sms` → denied; A31 `push` → denied.

No-send harness: provider keys unset; no `failed`→`queued`; synthetic UUIDs only.

**R2-20 exact CI script names** (implementation PR; not authored here): listed under R29 / `docs/evidence/S0_CUT2_FUTURE_CI_SCRIPT_NAMES_20260911.json`.

---

## R27–R28 — Dual-compatible rollout (app first, then 00115)

**SR3 PRODUCTION RULE (R3-10 / R3-19) SUPERSEDES SR2 Phase A step 3.**  
Production missing-RPC: **FAIL CLOSED / DO NOT ENQUEUE**. **No** raw `service_role` INSERT during the cutover window. Disposable/testing harness may still use the frozen 42883/PGRST202 matcher **only** if explicitly marked non-production.

**Phase A (app deploy, function may be absent):**  
`src/lib/enqueue-outbound-notification.ts` (service_role client):

1. `rpc('enqueue_outbound_notification', { p_notification_type, p_domain_object_id, p_channel, p_recipient_membership_id, p_locale })`
2. On success (including `duplicate`/`denied` **from the function**) → **stop**. **Never** fallback.
3. **PRODUCTION:** if the RPC is missing → **FAIL CLOSED / DO NOT ENQUEUE**. Do **not** INSERT.  
   **DISPOSABLE / TESTING ONLY (non-production):** table INSERT of a server-derived row **ONLY** when the error identity matches **exactly** the frozen matcher below — and that path MUST be compiled/gated out of production.

**Frozen missing-function identity (matcher identity unchanged; PRODUCTION must not INSERT):**

| Layer | Exact identity |
|-------|----------------|
| Postgres SQLSTATE | **`42883`** (`undefined_function`) |
| supabase-js / PostgREST `error.code` | **`42883`** **OR** **`PGRST202`** |
| Message (case-insensitive) | contains `enqueue_outbound_notification` **AND** (`does not exist` **OR** `could not find the function`) |

**NEVER fallback** if `code` is `42501`, `23505`, `22P02`, `PGRST301`, HTTP 401/403, network/timeout, or RPC returned `denied`/`duplicate`.

**Release order:** **R3-19 exactly** (below). App-first order is unchanged: do **not** apply 00115 before the fail-closed provenance-aware app is in production.

---

## R29 — 00115 contract (names / preconditions only — **do not author SQL in this PR**)

Suggested filename later: `supabase/migrations/00115_s0_p0b_cut2_notification_queue.sql`

**CREATE:** `enqueue_outbound_notification(...)` (R2); optional internal helpers **not** granted to `authenticated`.  
**DROP:** policies named in R19.  
**REVOKE/GRANT:** R19.  
**CREATE UNIQUE INDEX:** `idx_notifications_queue_cut2_semantic_idempotency_unique` (R10 **as revised by R3-16** — `WHERE cut2_provenance_version = 1`).  
**SR4 SUPERSEDES “Do not DROP existing WhatsApp uniques”:** DROP + CREATE the same 17 names with `AND cut2_provenance_version = 1` (R4-2). SMS/email twins of old WA indexes are **not** required if the semantic index is present.  
**00115 atomic order:** **R4-21 SUPERSEDES R3-3.**  
**Preconditions (`CUT2_ABORT`) — DB-observable only (no source/CI gates in SQL):**  
1. `schema_migrations.version = '20260911183755'` exists.  
2. Policy `Authenticated users can queue notifications` exists with `WITH CHECK` containing `auth.uid()`.  
3. `notification_queue_status` labels are exactly `queued`,`sent`,`failed` (no `processing`).  
4. `notifications_queue` has **no** `group_id` column.  
5. `to_regclass('public.notification_policies')` IS NULL.  
6. The 17 live WhatsApp unique index **names** exist **AND** each `pg_indexes.indexdef` equals the frozen `old_exact_indexdef` in `S0_CUT2_LEGACY_WA_INDEX_PROVENANCE_MATRIX_20260911.json` **exactly**. Any drift → `CUT2_ABORT` **before DROP**.  

**Not in 00115 SQL:** deployed app SHA; sms-sender source scan; route 410 checks; package tests.  

**Separate CI/static — exact future script names (R2-20). Names frozen; files are NOT authored in this PR:**

| Script | Assertion |
|--------|-----------|
| `scripts/test-s0-cut2-sms-send-410.mjs` | `/api/sms/send` → **410** |
| `scripts/test-s0-cut2-whatsapp-send-410.mjs` | `/api/whatsapp/send` all branches (typed, `{template,components}`, `{text}`) → **410** |
| `scripts/test-s0-cut2-proxy-claim-active-owner-admin.mjs` | ACTIVE owner/admin only; moderator/member/pending/suspended/exited/archived **DENY** |
| `scripts/test-s0-cut2-sms-sender-no-queue-insert.mjs` | `sms-sender` + `send-sms-notification` do not INSERT `notifications_queue` |
| `scripts/test-s0-cut2-producers-use-enqueue-adapter.mjs` | all 15 `produce*` use adapter; **production** adapter has **no** `.from("notifications_queue").insert` |
| `scripts/test-s0-cut2-adapter-fallback-42883-only.mjs` | matcher identity remains exact `42883`/`PGRST202`; **production** must fail-closed (no INSERT); disposable/testing only if explicitly non-production |
| `scripts/test-s0-cut2-raw-meta-drain-only.mjs` | raw Meta/provider adapter call sites restricted to drain boundary |
| `scripts/test-s0-cut2-no-extra-provider-send.mjs` | no new provider send outside approved boundary |
| `scripts/test-s0-cut2-provenance-gate.mjs` | **NEW R3-21** — only `cut2_provenance_version=1` is trusted; RPC hardcodes 1; clients cannot mint it |
| `scripts/test-s0-cut2-legacy-quarantine.mjs` | **NEW R3-21** — NULL provenance untouched; no send/render/provider/update/upgrade |
| `scripts/test-s0-cut2-idempotency-provenance.mjs` | **NEW R3-21** — trusted unique index only matches provenance=1; legacy keys cannot poison |
| `scripts/test-s0-cut2-worker-column-grants.mjs` | **NEW R3-21** — service_role UPDATE only `status`,`error_message`,`attempts`,`sent_at`,`data`; MUST NOT `cut2_provenance_version`,`channel`,`template`,`user_id`,`created_at`,`id` |
| `scripts/test-s0-cut2-legacy-wa-index-provenance.mjs` | **NEW R4-23** — each of 17 WA uniques is provenance-scoped; NULL fixture does not block trusted insert |
| `scripts/test-s0-cut2-duplicate-trusted-lookup.mjs` | **NEW R4-23** — duplicate lookup only provenance=1 + channel + template + idempotencyKey; legacy id never returned |
| `scripts/test-s0-cut2-idempotency-conflict-mismatch.mjs` | **NEW R4-23** — conflict without trusted canonical row → `trusted_idempotency_conflict_mismatch`, no mutation |

**Release gate name (created at release time, not now):**  
`docs/evidence/S0_CUT2_DB_CUTOVER_RELEASE_CHECKLIST_YYYYMMDD.md`  
Must record: deployed Vercel SHA **==** Daybreak-qualified impl SHA; relays 410 in production; production adapter fail-closed (no raw INSERT); drain returns `cut2_db_not_ready` until 00115; **then** founder authorizes 00115 apply per **R3-19**.  
**Never:** DELETE FROM `notifications_queue`; retry failed; edit `00001`–`00114`; upgrade NULL provenance.

---

## R30 — PR #69 / #70 / Cut 3 / M2 / F3-06

Untouched / unapplied. Cut 2 static allowlist ≠ policy tables. Cut 3 storage not started. M2 quiet-hours `DEFER_UNTIL` not started. F3-06 not started. Cut 1 unmodified.

---

## SECURITY REVISION 2 — gap closeout (R2-1 … R2-27)

Do not reopen: Layer B; R2 RPC signature; EXECUTE `service_role` only; `search_path ''`; no raw contact/content/template/data/status args; `data.groupId` not authz; `/api/whatsapp/send` → 410; Meta after Cut 2 = drain only; app-first→DB cutover; PR69/70/Cut3. **SR3 supersedes** SR2 envelope-as-trust, SR2 production INSERT fallback, SR2 broad UPDATE, and the SR2 index WHERE (no provenance predicate).

### R2-A — SQL does not render

RPC writes the envelope (R5). Drain TypeScript owns `paymentReceiptSms` / `sendEmail` / `dispatchWhatsAppWithResult`. SQL has no dependency on `sms-templates.ts`.

### R2-B — Per-type channel DEFAULT DENY

See `S0_CUT2_CHANNEL_RENDERER_MATRIX_20260911.json`. ALLOW only if recipient + prefs + renderer + idempotency + domain row exist. `push` DENY all.

**`EmailTemplate` union (`src/lib/send-email.ts`) — ALLOW email ONLY if `notification_type` maps to one of these and a dedicated mapping exists:**  
`welcome`, `payment-receipt`, `payment-reminder`, `event-reminder`, `minutes-published`, `invitation`, `notification`, `proxy-claim`.

Frozen mapping (email ALLOW): `welcome`→`welcome`, `payment_receipt`→`payment-receipt`, `payment_reminder`→`payment-reminder`, `event_reminder`→`event-reminder`, `minutes_published`→`minutes-published`, `member_invitation`→`invitation`.

**`notification`:** live `calculate-standing.ts` uses it with **client-rendered** `title`/`body` — **EMAIL DENY** (do not invent a server-owned generic).  
**`proxy-claim`:** module exists; **EMAIL DENY** (no authoritative stored email; `memberships` has phone only).  
No dedicated email modules for loan/fine/standing/relief/hosting/subscription/announcement/election → **EMAIL DENY**.

**`SmsTemplate` / `send-sms-notification.ts` cases (ALLOW SMS only if renderer exists):**  
`payment-reminder`, `event-reminder`, `payment-receipt`, `welcome`, `minutes-published`, `payment-pending` (**DORMANT / not allowlisted**), `hosting-reminder`, `standing-changed`, `hosting-assignment`, `relief-enrollment`, `remittance-status`, `subscription-expiring`, `relief-claim-approved`, `relief-claim-denied`, `announcement`, `loan-approved`, `fine-issued`, `proxy-claim`.

**Verified missing SMS renderer → DENY:** `loan_overdue`, `member_invitation`, `election_opened`. `hosting_swap` reuses `hosting-reminder` renderer → ALLOW.

### R2-C — Email source

| Kind | Source |
|------|--------|
| Registered member | `memberships.user_id` → **`auth.users.email`**. Live `profiles` columns: id, full_name, display_name, avatar_url, phone, preferred_locale, preferred_theme, timezone, created_at, updated_at, notification_preferences, date_of_birth — **no `email`**. |
| Invitation | `invitations.email` |
| Proxy claim | **EMAIL DENY**. `proxy_claim_tokens.email` is not auto-authoritative (caller-written). `memberships` has no email. |

### R2-D — Proxy actor (Cut 1)

Caller membership on **same** `memberships.group_id` as the proxy target MUST be:

`membership_status = 'active'` **AND** `role IN ('owner','admin')`.

**DENY** (negative tests A22–A27): `moderator`, `member`; `pending_approval`; `suspended`; `exited`; `archived`. Also DENY if caller membership missing or different group. Target proxy must be `is_proxy`, `user_id IS NULL`, `membership_status = 'active'`.

Live CHECK (MCP): `membership_status IN ('active','pending_approval','exited','suspended','archived')`.

### R2-E — Idempotency

See `S0_CUT2_IDEMPOTENCY_INDEX_MATRIX_20260911.json`. Live `pg_indexes` on `llbnliixczcqfftxpsmb` copied **verbatim** (`indexdef` strings). Canonical index WHERE revised by **R3-16** (`cut2_provenance_version = 1`). **SR4:** the 17 WA uniques are **not** left unscoped — DROP + CREATE same name with `AND cut2_provenance_version = 1` (see `S0_CUT2_LEGACY_WA_INDEX_PROVENANCE_MATRIX_20260911.json`). No unique yet for `minutes_published` / `election_opened` / `announcement` / `proxy_claim` / `hosting_swap` — covered by the canonical trusted-only index. No TBD keys. `idempotencyKey` is **idempotency only**, not trust evidence.

### R2-F / R2-20 — Source/CI out of SQL; exact script names

00115 `CUT2_ABORT` = R29 DB-observable list only. CI/static scripts are **not** SQL preconditions.

Frozen implementation CI filenames (do not author in this PR) — see R29 table:

R2-20 (unchanged names): `scripts/test-s0-cut2-sms-send-410.mjs`, `scripts/test-s0-cut2-whatsapp-send-410.mjs`, `scripts/test-s0-cut2-proxy-claim-active-owner-admin.mjs`, `scripts/test-s0-cut2-sms-sender-no-queue-insert.mjs`, `scripts/test-s0-cut2-producers-use-enqueue-adapter.mjs`, `scripts/test-s0-cut2-adapter-fallback-42883-only.mjs`, `scripts/test-s0-cut2-raw-meta-drain-only.mjs`, `scripts/test-s0-cut2-no-extra-provider-send.mjs`.

**R3-21 added names (do not rename R2-20):** `scripts/test-s0-cut2-provenance-gate.mjs`, `scripts/test-s0-cut2-legacy-quarantine.mjs`, `scripts/test-s0-cut2-idempotency-provenance.mjs`, `scripts/test-s0-cut2-worker-column-grants.mjs`.

Release checklist (created at cutover, not now): `docs/evidence/S0_CUT2_DB_CUTOVER_RELEASE_CHECKLIST_YYYYMMDD.md` — deployed Vercel SHA == Daybreak-qualified impl SHA.

### R2-G — `/api/sms/send` = 410 only

Replacement table in R11. No remaining `{to,template,data}` path.

---

## SECURITY REVISION 3 — unforgeable provenance + pre-00115 legacy quarantine (R3-1 … R3-22)

Machine-readable copy: `docs/evidence/S0_CUT2_PROVENANCE_QUARANTINE_CONTRACT_20260911.json`.

Do not reopen: Layer B; RPC signature/args; domain/channel/renderer matrices; email/phone/tenant/recipient; proxy ACTIVE owner/admin; sms/whatsapp 410; Meta=drain only; canonical idempotency **design** (key expressions / failed no-retry / preserve WA uniques); 00115 forward-only; app-first order; PR69/70/Cut3. This section **only** freezes the provenance column, quarantine, production no-raw-insert, column UPDATE grants, and the trusted-only index predicate.

### R3-1 — Column contract (PLAN only; no 00115 file in this PR)

`public.notifications_queue.cut2_provenance_version smallint`

| Rule | Value |
|------|--------|
| DEFAULT | **NONE**. Existing rows → **NULL**. |
| Trusted value | **`1`** |
| CHECK | `cut2_provenance_version IS NULL OR cut2_provenance_version = 1` |
| Pre-00115 | Column **does not exist**. Attacker **cannot** INSERT `provenance=1`. |

### R3-2 — Pre-00115: column absent ⇒ unforgeable

Before 00115 applies, there is no `cut2_provenance_version` column. A client or `service_role` INSERT cannot mint a trusted row. Any INSERT that races 00115 lands as **NULL** provenance after the column is added (R3-12).

### R3-3 — 00115 atomic bundle (names only — do not author SQL here)

**SUPERSEDED by R4-21.** Keep the objects; do **not** use this order. R4-21 requires fingerprint → ADD column → DROP/RECREATE 17 WA uniques → canonical index → RPC → policies/revokes/grants/protections → postconditions → COMMIT.

### R3-4 — RPC hardcodes provenance=1

The function **MUST** `INSERT … cut2_provenance_version = 1`.  
**Not** a parameter. **Not** read from `data` / JSON / envelope. R2 rejected-parameter list is unchanged; do **not** add `p_cut2_provenance_version`.

### R3-5 — ONLY trusted discriminator

Trusted **iff** `cut2_provenance_version = 1`.

**NOT** trust evidence (may exist on forged/legacy rows): `data.cut2Semantic`, `data.envelopeVersion`, `data.idempotencyKey`, `template`, channel, `user_id`, status, any other JSON field. `idempotencyKey` remains **idempotency only**.

### R3-6 — Drain after cutover

Deliver **ONLY** rows matching `status = 'queued' AND cut2_provenance_version = 1`, via semantic renderers (R2-A / channel matrix). No other SELECT set is sendable.

### R3-7 — NULL provenance = LEGACY / UNTRUSTED QUARANTINE

For `cut2_provenance_version IS NULL`: **no** send, **no** render, **no** provider call, **no** UPDATE (`status`/`attempts`/`error_message`/`sent_at`/`data`), **no** DELETE, **no** requeue, **no** replace, **no** copy, **no** upgrade. Row remains untouched.

### R3-8 — No legacy raw path after 00115

After 00115 there is **no** `data.message` / raw `data.template` / `data.components` delivery path for NULL-provenance rows. SR2’s “legacy branch for pre-cutover rows” is **void**.

### R3-9 — Pre-00115 drain: fail closed on DB-not-ready

Drain MUST use a provenance-aware query. If the column (or 00115 objects) are absent → **NO PROVIDER DELIVERY**. Return:

`{ "cut2_db_not_ready": true, "processed": 0, "sent": 0, "failed": 0 }`

Short delivery pause is accepted. Do not fall back to `SELECT * WHERE status='queued'`.

### R3-10 — Production missing-RPC: FAIL CLOSED / DO NOT ENQUEUE

During the cutover window, if `enqueue_outbound_notification` is missing: **do not** raw-`INSERT` via `service_role`. Production adapter fails closed. Disposable/testing fallback (42883/PGRST202 matcher) is allowed **only** when explicitly marked non-production. Matcher **identity** stays frozen (do not reopen).

### R3-11 — Pre-app-cutover queued inventory (READ-ONLY)

`queued_count = COUNT(*) FROM notifications_queue WHERE status = 'queued'`. Prefer **0**. If `> 0`, wait for **natural drain** only. **No** force-send, DELETE, status rewrite, or requeue. If rows remain and founder does not accept them as post-cutover quarantine → **HOLD APP CUTOVER**.

### R3-12 — Race + Chief-verified `service_role` UPDATE grants

**Race:** A table INSERT that commits before 00115 receives **NULL** provenance when the column is added (no DEFAULT). That row is **never** trusted. No upgrade path (R3-15).

**Chief-verified UPDATE columns (tip `1693b806` — folded here).** Drain and webhook on that tip write **only** the columns below. 00115 MUST GRANT `service_role` UPDATE on `notifications_queue` to **exactly** this set:

`status`, `error_message`, `attempts`, `sent_at`, `data`

**MUST NOT UPDATE:** `cut2_provenance_version`, `channel`, `template`, `user_id`, `created_at`, `id`.

**Drain** (`src/app/api/cron/drain-notification-queue/route.ts`) updates only:

| Column | How used |
|--------|----------|
| `status` | `sent` / `failed` |
| `sent_at` | set on successful persist |
| `error_message` | clear on sent; set on fail/retry |
| `attempts` | increment on fail/retry |
| `data` | merge `providerMessageId` (and `providerStatus`) into jsonb |

**Webhook** (`src/lib/whatsapp-webhook-status.ts`) updates **queue rows only** via `{ data: nextData }`:

- Lookup: `.eq("channel","whatsapp").contains("data", { providerMessageId })`
- Patch: provider status fields (`latestProviderStatus`, `latestProviderStatusAt`, optional `providerErrorCode` / `providerErrorMessage`)

Webhook also **INSERT**s into `whatsapp_message_status_events` (separate table). That INSERT is **out of Cut 2 queue privilege scope** — 00115 queue REVOKE/GRANT does not define privileges on that table.

REVOKE broad `service_role` UPDATE on `notifications_queue`; grant only the five columns above.

### R3-13 — Worker / webhook UPDATE columns (pointer)

Authoritative freeze is **R3-12** (Chief fold). Site-level drain keys remain: sentPayload `{status,sent_at,error_message,data}`; persist-fail / max-retries `{status,attempts,error_message}`; retry `{attempts,error_message}`. Webhook queue UPDATE `{data}` only.

### R3-14 — Forbidden UPDATE targets

`cut2_provenance_version`, `channel`, `template`, `user_id`, `created_at`, `id` must be omitted from column grants and rejected by the immutability trigger if present.

### R3-15 — Provenance immutability

Column-level grants (R3-12) **plus** optional trigger: `IF OLD.cut2_provenance_version IS DISTINCT FROM NEW.cut2_provenance_version THEN RAISE`. **No** upgrade path. **No** upgrade RPC. NULL cannot become 1. 1 cannot become NULL or any other value.

### R3-16 / R3-17 — Trusted-only canonical index

```sql
CREATE UNIQUE INDEX idx_notifications_queue_cut2_semantic_idempotency_unique
ON public.notifications_queue (channel, template, ((data ->> 'idempotencyKey')))
WHERE cut2_provenance_version = 1
  AND NULLIF(BTRIM(data ->> 'idempotencyKey'), '') IS NOT NULL;
```

No status filter. Canonical design unchanged (R4-20). **SR4:** the 17 WA uniques are DROP+CREATE same name with `AND cut2_provenance_version = 1` — they are no longer unscoped. Legacy keys cannot poison any trusted index.

### R3-18 — Post-00115 postcondition

Report `legacy_quarantine_count` = `COUNT(*) WHERE status='queued' AND cut2_provenance_version IS NULL`. Ideal **0**. If `> 0`: **report only**; do not process, send, clean, delete, upgrade, or requeue. **R4-19:** `> 0` may be a **SECURITY PASS** if those rows are proven non-participating in all trusted indexes (17 scoped WA + canonical).

### R3-19 — Production release order (exact, frozen)

1. **READ-ONLY** `queued_count` (`status='queued'`). Prefer 0. If `> 0`, wait for natural drain only (R3-11). Else **HOLD APP CUTOVER**.
2. **Deploy production app first** (Daybreak-qualified impl SHA): RPC-only enqueue (**FAIL CLOSED / DO NOT ENQUEUE** if RPC missing — R3-10); provenance-aware drain (**`cut2_db_not_ready`**, processed/sent/failed=0, no provider — R3-9); relays 410.
3. Confirm deployed Vercel SHA **==** Daybreak-qualified impl SHA (`S0_CUT2_DB_CUTOVER_RELEASE_CHECKLIST_YYYYMMDD.md`).
4. **Then** founder applies **00115 atomically** (R3-3).
5. **READ-ONLY** report `legacy_quarantine_count` (R3-18). If `> 0`, report; do not process/clean.
6. Post-cutover drain delivers **only** `queued AND cut2_provenance_version=1` (R3-6). NULL rows stay quarantined (R3-7).

Do **not** apply 00115 before step 2 is live. Insert-before-00115 races become NULL forever (R3-12).

### R3-20 — Provenance tests A–L (founder brief; freeze)

| ID | Assert |
|----|--------|
| **A** | RPC INSERT hardcodes `cut2_provenance_version=1`. No provenance argument. JSON/`data` cannot set it. |
| **B** | Pre-00115 the column does not exist; INSERT of `provenance=1` is impossible. |
| **C** | Post-00115 `anon` / `authenticated` / `service_role` table INSERT is DENY (cannot mint provenance=1). |
| **D** | `service_role` UPDATE cannot change `cut2_provenance_version` (column grant + optional trigger). |
| **E** | Drain after cutover selects/delivers only `queued AND cut2_provenance_version=1` via semantic renderers. |
| **F** | NULL-provenance queued rows: no send/render/provider/UPDATE/DELETE/requeue/replace/copy/upgrade — untouched. |
| **G** | After 00115, no legacy raw `data.message` / `template` / `components` path for NULL-provenance rows. |
| **H** | Pre-00115 drain: DB not ready → `cut2_db_not_ready`, processed/sent/failed=0, zero provider calls. |
| **I** | Production adapter missing-RPC → FAIL CLOSED / DO NOT ENQUEUE; no raw INSERT. |
| **J** | Canonical unique index matches only `cut2_provenance_version=1`; a legacy key cannot poison it. |
| **K** | Webhook UPDATE `data` only; cannot SET `cut2_provenance_version`, `channel`, `template`, `user_id`, `created_at`, `id`. |
| **L** | No upgrade path/RPC NULL→1; postcondition reports `legacy_quarantine_count` read-only and does not clean. |

### R3-21 — Added future CI names (do not rename R2-20)

1. `scripts/test-s0-cut2-provenance-gate.mjs`
2. `scripts/test-s0-cut2-legacy-quarantine.mjs`
3. `scripts/test-s0-cut2-idempotency-provenance.mjs`
4. `scripts/test-s0-cut2-worker-column-grants.mjs`

Files are **not** authored in this PR.

### R3-22 — Docs / evidence only

This revision authors **no** `00115` SQL, **no** runtime, **no** CI script files, **no** production mutation.

---

## SECURITY REVISION 4 — provenance-scope the 17 WA unique indexes (R4-1 … R4-25)

Machine-readable copy: `docs/evidence/S0_CUT2_LEGACY_WA_INDEX_PROVENANCE_MATRIX_20260911.json` (**17/17, TBD=0**).

Do not reopen: Layer B; RPC signature; provenance column; NULL quarantine; drain isolation; app-first no-send; route 410s; matrices; proxy roles; worker column grants; canonical Cut 2 index design (`provenance=1` + non-empty `idempotencyKey`); production rollout except the index-cutover assertions below.

### R4-1 — Problem

Unscoped live WhatsApp unique indexes match **any** row with the key, including `cut2_provenance_version IS NULL`. A forged/pre-00115 NULL-provenance row can **UNIQUE-block** a trusted `provenance=1` INSERT (availability / idempotency poisoning).

### R4-2 — Disposition for ALL 17

**PRESERVE** name + key expressions + existing template/channel/data conditions **verbatim** (including `::text` casts and live NULL-check asymmetry). **ADD** `cut2_provenance_version = 1` **inside** the WHERE:

Atomic in 00115 (PLAN only — **no migration file**):

```
DROP INDEX public.<same_name>;
CREATE UNIQUE INDEX <same_name> ON public.notifications_queue (...)
WHERE ((<exact existing WHERE body without one outer paren layer>) AND cut2_provenance_version = 1);
```

Chief READ-ONLY reconfirm on `llbnliixczcqfftxpsmb`: **exactly 17** WhatsApp unique indexes. `old_exact_indexdef` is the live `pg_indexes.indexdef` **verbatim** (do not paraphrase).

**Asymmetry (must preserve):** `payment_receipt` and `welcome` live predicates have `data ? '…'` **only** — they do **NOT** include `((data ->> …) IS NOT NULL)`. Do not invent that check. The other 15 keep their existing `IS NOT NULL` fragments.

No `CONCURRENTLY`. No data mutation. No rename preferred.

### R4-3 — Exact 17 names (verbatim live `indexdef` frozen)

`claim_approved`, `claim_denied`, `event_reminder`, `fine_issued`, `hosting_assignment`, `hosting_reminder`, `loan_approved`, `loan_overdue`, `member_invitation`, `payment_receipt`, `payment_reminder`, `relief_enrollment`, `remittance_confirmed`, `remittance_disputed`, `standing_changed`, `subscription_expiring`, `welcome`.

Full names: `idx_notifications_queue_whatsapp_<short>_unique` (claim_* templates remain `relief_claim_approved` / `relief_claim_denied`). Each row in the matrix has `old_exact_indexdef` (Chief-verbatim live), `indexed_expression`, `old_predicate`, `old_where_body_without_outer_parens`, `future_predicate`, `future_exact_indexdef`.

### R4-4 / R4-5 / R4-6 — Mechanics

No `CONCURRENTLY`. No UPDATE/DELETE/backfill of queue rows during rebuild. Keep the same index name (do not rename).

### R4-7 / R4-8 / R4-9 — Fingerprint precondition

00115 MUST fingerprint **EXACT** current `pg_indexes.indexdef` for all 17 against `old_exact_indexdef`. Any drift → **`CUT2_ABORT` before DROP**. Names-only check is insufficient.

### R4-10 — Unique conflict: no mutation / no convert

On UNIQUE conflict: **no** UPDATE, REQUEUE, REPLACE, or convert-legacy (NULL → 1). Failed/sent/queued trusted rows stay as-is.

### R4-11 — Duplicate lookup (trusted only)

```
SELECT id FROM public.notifications_queue
 WHERE cut2_provenance_version = 1
   AND channel = p_channel
   AND template = p_notification_type
   AND data->>'idempotencyKey' = v_key
 LIMIT 1;
```

### R4-12 — NULL legacy never returned

A NULL-provenance row MUST NOT be returned as `duplicate` or as `queue_id`.

### R4-13 — Conflict mismatch

If a unique index raises a conflict but **no** matching trusted canonical row exists → return `queue_id` NULL, `result='trusted_idempotency_conflict_mismatch'`. **No mutation.** (RPC `RETURNS TABLE` signature unchanged; this is a new `result` text value.)

### R4-14 — Trusted duplicate

Trusted duplicate in `queued` / `sent` / `failed` → existing **trusted** id + `result='duplicate'`. No mutation.

### R4-15 … R4-19 — Epoch

New trusted idempotency epoch. **No** backfill `provenance=1`. **No** automatic legacy replay/re-enqueue. Legacy rows remain stored / quarantined / inert. `legacy_quarantine_count > 0` may be a **SECURITY PASS** if those rows are proven **non-participating** in **all** trusted indexes (17 scoped WA + canonical).

### R4-20 — Canonical index unchanged

`idx_notifications_queue_cut2_semantic_idempotency_unique` stays:

```
WHERE cut2_provenance_version = 1
  AND NULLIF(BTRIM(data ->> 'idempotencyKey'), '') IS NOT NULL;
```

No status filter. Do not reopen key expressions.

### R4-21 — Atomic 00115 order (exact)

Single transaction:

1. Validate fingerprints of all 17 `indexdef`s (R4-8). Drift → `CUT2_ABORT` (no DROP).
2. ADD `cut2_provenance_version smallint` **without DEFAULT** + CHECK (NULL OR 1).
3. DROP / RECREATE all 17 with `AND cut2_provenance_version = 1`.
4. CREATE canonical unique index (R4-20).
5. CREATE `enqueue_outbound_notification` (R2 signature; hardcodes provenance=1; R4-10–R4-14 lookup).
6. DROP unsafe policies (R19 names).
7. REVOKE INSERT (anon, authenticated, **and** `service_role`).
8. Column-level UPDATE grants (R3-12: `status`, `error_message`, `attempts`, `sent_at`, `data`).
9. Provenance protections (immutability trigger optional).
10. Postconditions (`legacy_quarantine_count` report; prove 17+canonical exclude NULL).
11. COMMIT.

### R4-22 — Evidence

`S0_CUT2_LEGACY_WA_INDEX_PROVENANCE_MATRIX_20260911.json` — 17/17, no TBD. Each row: `index_name`, `old_exact_indexdef`, `indexed_expression`, `old_predicate`, `future_predicate`, `future_exact_indexdef`, `legacy_poison_fixture`, `trusted_rpc_case`, `expected_first_trusted_result`, `expected_second_trusted_result`, `legacy_row_unchanged`.

### R4-23 — Added future CI names (do not rename R2-20 / R3-21)

1. `scripts/test-s0-cut2-legacy-wa-index-provenance.mjs`
2. `scripts/test-s0-cut2-duplicate-trusted-lookup.mjs`
3. `scripts/test-s0-cut2-idempotency-conflict-mismatch.mjs`

Files are **not** authored in this PR.

### R4-24 — Required tests (implementation PR)

For each of 17: seed the `legacy_poison_fixture` (NULL provenance, same WA key) → first trusted RPC `inserted` → second trusted RPC `duplicate` (trusted id) → fixture row byte-identical. Plus: lookup never returns NULL id; mismatch path returns `trusted_idempotency_conflict_mismatch` with zero mutation.

### R4-25 — Docs / evidence only

This revision authors **no** `00115` SQL, **no** runtime, **no** CI script files, **no** production mutation.

---

## Daybreak handoff

| Gate | Result |
|------|--------|
| Layer B only; Layer A removed | PASS (do not reopen) |
| Exact RPC signature | PASS — R2 (do not reopen) |
| Domain matrix complete; unknown named producers = 0 | PASS — 22 types |
| SQL does not render; drain TypeScript renders | PASS — R2-A / R5 |
| Per-type channel DEFAULT DENY | PASS — channel matrix |
| Email source auth.users / invitations; proxy email DENY | PASS — R2-C |
| Proxy actor ACTIVE owner/admin only | PASS — R2-D |
| Canonical idempotencyKey + live pg_indexes | PASS — R2-E; canonical WHERE R3-16; **17 WA uniques provenance-scoped R4** |
| 00115 preconditions DB-only; CI/SHA outside SQL | PASS — R2-F / R2-20 + R3-21 + R4-23 (15 script names) |
| `/api/sms/send` 410 only | PASS — R2-G |
| `/api/whatsapp/send` 410; Meta = drain only | PASS (do not reopen) |
| App-first then 00115 | PASS — R3-19 (supersedes SR2 production INSERT fallback) |
| Unforgeable provenance column; NULL = quarantine | PASS — R3-1–R3-8 |
| Production missing-RPC: no raw INSERT | PASS — R3-10 |
| Worker column UPDATE grants Chief-verified | PASS — R3-12 (do not reopen) |
| 17 WA uniques provenance-scoped; fingerprints frozen | PASS — R4-1–R4-9 / matrix 17/17 |
| Duplicate lookup trusted-only; mismatch fail-closed | PASS — R4-10–R4-14 |
| 00115 order fingerprint→column→17 rebuild→canonical→RPC | PASS — R4-21 |
| No SQL / no runtime in this PR | PASS |
| PR #69/#70/Cut 3/Cut 1 | PASS — R30 |

### HOLD blockers

**Open count: 0** for this contract.  
Implementation-time aborts remain: any of 17 `indexdef`s drift from frozen `old_exact_indexdef`; missing expected WA unique index at apply; `notification_policies` present; service_role INSERT grant left on after 00115; app SHA ≠ Daybreak-qualified impl SHA at apply time; production adapter still contains a raw INSERT path; drain still delivers NULL-provenance rows; any trusted unique index still matches NULL provenance.

---

## Non-goals / STOP

No implementation, no `00115` file, no prod write, no sends, no failed retry, no #69/#70/#71 merge, no Cut 3/M2/F3-06, no Cut 1 edit, no Layer A apply, no GRANT enqueue to `authenticated`, no re-open `/api/whatsapp/send` “just for typed”, no provenance upgrade RPC, no production raw INSERT fallback.
