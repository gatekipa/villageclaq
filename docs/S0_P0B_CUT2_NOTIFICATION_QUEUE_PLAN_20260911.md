# S0 P0-B Cut 2 — SECURITY REVISION 2 (Daybreak HOLD closeout)

**Date:** 2026-09-11  
**Status:** **SECURITY REVISION 2 — READY FOR DAYBREAK RE-REVIEW**  
**Overall recommended verdict:** **PASS — LAYER B ONLY; R1–R30 + R2-1–R2-27 FROZEN**  
**Implementation:** **NOT AUTHORIZED** until Daybreak **PASS**. PASS authorizes **implementation on a dedicated branch only**, **NOT** production apply.  
**This PR:** docs / evidence only. **No** `00115` SQL. **No** runtime code.  
**Authoritative freeze:** this document (SR2). SR1 remains ancestry; conflicting SR1 sentences below are **superseded** by the SR2 section.  
**Previous Daybreak-reviewed tip (MUST be ancestry):** `d041bd10d67c660b7414d4f5db74f9e8985f5886`  
**Evidence:**  
- `docs/evidence/S0_CUT2_NOTIFICATION_QUEUE_LIVE_INVENTORY_20260911.json`  
- `docs/evidence/S0_CUT2_DOMAIN_ENQUEUE_MATRIX_20260911.json`  
- `docs/evidence/S0_CUT2_CHANNEL_RENDERER_MATRIX_20260911.json`  
- `docs/evidence/S0_CUT2_IDEMPOTENCY_INDEX_MATRIX_20260911.json`  
- `docs/evidence/S0_CUT2_CHIEF_READONLY_SR2_FOLD_20260911.json`

---

## Pins (do not drift)

| Pin | Value |
|-----|-------|
| This revision parent tip | `d041bd10d67c660b7414d4f5db74f9e8985f5886` |
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
8. INSERT `status='queued'` only. Unique conflict → `duplicate` (no UPDATE).
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

**Legacy discriminator (NEW rows only on semantic branch):**

A queued row is Cut 2 semantic **iff**:

`data.cut2Semantic === true` **OR** (`data.idempotencyKey` is non-empty **AND** `template` is in the type allowlist).

Else → **legacy** branch: existing `processSms(data.message)` / `processEmail(data.template, data.emailData)` / `processWhatsApp(whatsappType | raw template+components)` for pre-cutover rows only. No new legacy rows after 00115.

NEW Cut 2 rows **must not** write `data.message`, `data.components`, or caller `data.template` (email/Meta).

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
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_queue_cut2_semantic_idempotency_unique
  ON public.notifications_queue
  USING btree (
    channel,
    template,
    ((data ->> 'idempotencyKey'::text))
  )
  WHERE ((data ->> 'idempotencyKey'::text) IS NOT NULL)
    AND ((data ->> 'idempotencyKey'::text) <> '');
```

No status predicate — **includes failed rows**. Preserve all live WhatsApp unique indexes (verbatim `pg_indexes` in the evidence file).

On unique conflict (new index **or** legacy WA index): `SELECT` existing `id`; return `(existing_id, 'duplicate')`. **No UPDATE / DELETE / REQUEUE / REPLACE**, including `failed`.

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
| `service_role` | GRANT | **DENY** | GRANT | DENY | **GRANT** |
| `postgres` | owner | owner (00115 only) | owner | owner | owner |

- DROP policies: `Authenticated users can queue notifications`, `Staff can update notification queue`.
- KEEP SELECT: `Platform staff can view all notifications_queue`, `Staff can view notification queue`.
- DEFINER: `SET search_path TO ''`; bodies `public.`-qualified; no `auth.uid()` tenant trust.
- Status enum **unchanged** (`queued|sent|failed`). **No** `processing`.
- Drain: `CRON_SECRET`; SELECT `queued`; UPDATE sent/failed/attempts; **no INSERT**; keep `isAfricanPhoneNumber` before AT; **do not** select `failed`.
- Webhook: Meta signature; service_role **UPDATE `data` only**; must not set `status='queued'` on failed rows.

---

## R24–R26 — Tests + no-send

Disposable Postgres + mocked service_role. **No** Meta / AT / Resend / prod drain.

Must include: A1–A5 client INSERT/UPDATE/TRUNCATE DENY; A6 service_role table INSERT DENY; A7 RPC allowlisted type+channel inserted; A8 unknown type denied; A8b DENY channel for that type denied (no row); A9 missing domain row denied; A10 fan-out without membership denied; A11 foreign membership denied; A12 `groupId` smuggle impossible; A13 phone param impossible; A14 invitation NULL user inserted (WA/email if `invitations.email` present); A15 failed-row re-enqueue → existing id + `duplicate` (no UPDATE); A16 authenticated EXECUTE denied; A17 staff UPDATE denied; A18 **`/api/sms/send` any body → 410**; A19 `/api/whatsapp/send` typed **and** `{template,components}` **and** `{text}` **410**; A20 proxy-claim request phone ≠ DB phone → enqueue uses DB or denied; A21 proxy-claim target membership not `active` → denied; A22 proxy **actor** `role=moderator` DENY; A23 actor `role=member` DENY; A24 actor `membership_status=pending_approval` DENY; A25 actor `suspended` DENY; A26 actor `exited` DENY; A27 actor `archived` DENY; A28 email enqueue with `profiles.email` (column absent) impossible — source is `auth.users.email` or `invitations.email`; A29 `proxy_claim` + `p_channel=email` → denied; A30 `loan_overdue`/`election_opened`/`member_invitation` + `p_channel=sms` → denied; A31 `push` → denied.

No-send harness: provider keys unset; no `failed`→`queued`; synthetic UUIDs only.

---

## R27–R28 — Dual-compatible rollout (app first, then 00115)

**Phase A (app deploy, function may be absent):**  
`src/lib/enqueue-outbound-notification.ts` (service_role client):

1. `rpc('enqueue_outbound_notification', { p_notification_type, p_domain_object_id, p_channel, p_recipient_membership_id, p_locale })`
2. On success (including `duplicate`/`denied` **from the function**) → **stop**. **Never** fallback.
3. Fallback to service_role **table INSERT** of a **server-derived** row (same derivation as the RPC) **ONLY** when the error identity matches **exactly** R27 below.

**Frozen missing-function identity (ALL must match to fallback):**

| Layer | Exact identity |
|-------|----------------|
| Postgres SQLSTATE | **`42883`** (`undefined_function`) |
| supabase-js / PostgREST `error.code` | **`42883`** **OR** **`PGRST202`** |
| Message (case-insensitive) | contains `enqueue_outbound_notification` **AND** (`does not exist` **OR** `could not find the function`) |

**NEVER fallback** if `code` is `42501`, `23505`, `22P02`, `PGRST301`, HTTP 401/403, network/timeout, or RPC returned `denied`/`duplicate`.

**Release order (frozen)**

1. **Source / Vercel app first** (adapter + close relays + producers use adapter).  
2. **Then** apply `00115` (creates function, REVOKE INSERT).  
3. After 00115: function exists → RPC always; table INSERT denied → fallback dead (fail-closed if someone deletes the function).

Do **not** apply 00115 before the app adapter is in production.

---

## R29 — 00115 contract (names / preconditions only — **do not author SQL in this PR**)

Suggested filename later: `supabase/migrations/00115_s0_p0b_cut2_notification_queue.sql`

**CREATE:** `enqueue_outbound_notification(...)` (R2); optional internal helpers **not** granted to `authenticated`.  
**DROP:** policies named in R19.  
**REVOKE/GRANT:** R19.  
**CREATE UNIQUE INDEX IF NOT EXISTS:** `idx_notifications_queue_cut2_semantic_idempotency_unique` (R10). **Do not DROP** existing WhatsApp uniques. SMS/email twins of old WA indexes are **not** required if the semantic index is present.  
**Preconditions (`CUT2_ABORT`) — DB-observable only (no source/CI gates in SQL):**  
1. `schema_migrations.version = '20260911183755'` exists.  
2. Policy `Authenticated users can queue notifications` exists with `WITH CHECK` containing `auth.uid()`.  
3. `notification_queue_status` labels are exactly `queued`,`sent`,`failed` (no `processing`).  
4. `notifications_queue` has **no** `group_id` column.  
5. `to_regclass('public.notification_policies')` IS NULL.  
6. The 17 live WhatsApp unique index **names** listed in the idempotency evidence file exist.  

**Not in 00115 SQL:** deployed app SHA; sms-sender source scan; route 410 checks; package tests.  

**Separate CI/static (implementation PR):** no `notifications_queue.insert` in app producers; `/api/sms/send` and `/api/whatsapp/send` return 410; sms-sender does not INSERT.  

**Release prerequisite (founder, not SQL):** deployed Vercel SHA **equals** the Daybreak-qualified implementation SHA; relays 410 in production; **then** founder authorizes 00115 apply. Temporary pre-00115 existing-risk window is **accepted**.  
**Never:** DELETE FROM `notifications_queue`; retry failed; edit `00001`–`00114`.

---

## R30 — PR #69 / #70 / Cut 3 / M2 / F3-06

Untouched / unapplied. Cut 2 static allowlist ≠ policy tables. Cut 3 storage not started. M2 quiet-hours `DEFER_UNTIL` not started. F3-06 not started. Cut 1 unmodified.

---

## SECURITY REVISION 2 — gap closeout (R2-1 … R2-27)

Do not reopen: Layer B; R2 RPC signature; EXECUTE `service_role` only; `search_path ''`; no raw contact/content/template/data/status args; `data.groupId` not authz; no service_role INSERT after 00115; `/api/whatsapp/send` → 410; Meta after Cut 2 = drain only; app-first→DB cutover; pre-00115 existing-risk window accepted.

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

See `S0_CUT2_IDEMPOTENCY_INDEX_MATRIX_20260911.json`. Live `pg_indexes` on `llbnliixczcqfftxpsmb` copied **verbatim** (`indexdef` strings). **PRESERVE all unique WhatsApp indexes.** No unique yet for `minutes_published` / `election_opened` / `announcement` / `proxy_claim` / `hosting_swap` — covered by the new canonical semantic index. No TBD keys.

### R2-F — Source/CI out of SQL

00115 `CUT2_ABORT` = R29 DB-observable list only. CI/static + founder SHA gate are release prerequisites, not SQL.

### R2-G — `/api/sms/send` = 410 only

Replacement table in R11. No remaining `{to,template,data}` path.

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
| Canonical idempotencyKey + live pg_indexes | PASS — R2-E |
| 00115 preconditions DB-only; CI/SHA outside SQL | PASS — R2-F |
| `/api/sms/send` 410 only | PASS — R2-G |
| `/api/whatsapp/send` 410; Meta = drain only | PASS (do not reopen) |
| App-first then 00115 | PASS — R28 |
| No SQL / no runtime in this PR | PASS |
| PR #69/#70/Cut 3/Cut 1 | PASS — R30 |

### HOLD blockers

**Open count: 0** for this contract.  
Implementation-time aborts remain: missing expected WA unique index at apply; `notification_policies` present; service_role INSERT grant left on after 00115; app SHA ≠ Daybreak-qualified impl SHA at apply time.

---

## Non-goals / STOP

No implementation, no `00115` file, no prod write, no sends, no failed retry, no #69/#70/#71 merge, no Cut 3/M2/F3-06, no Cut 1 edit, no Layer A apply, no GRANT enqueue to `authenticated`, no re-open `/api/whatsapp/send` “just for typed”.
