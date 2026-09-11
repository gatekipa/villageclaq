# S0 P0-B Cut 2 — SECURITY REVISION 1 (Daybreak HOLD closeout)

**Date:** 2026-09-11  
**Status:** **SECURITY REVISION 1 — READY FOR DAYBREAK RE-REVIEW**  
**Overall recommended verdict:** **PASS — LAYER B ONLY; R1–R30 FROZEN**  
**Implementation:** **NOT AUTHORIZED** until Daybreak **PASS**. PASS authorizes **implementation on a dedicated branch only**, **NOT** production apply.  
**This PR:** docs / evidence only. **No** `00115` SQL. **No** runtime code.  
**Authoritative freeze:** this document (SR1). Prior Layer A / “survive policy drop” language is **VOID**.  
**Previous Daybreak-reviewed tip (base of this revision):** `1478c33129502026346f8fb386614f6c66b9836c`  
**Evidence:**  
- `docs/evidence/S0_CUT2_NOTIFICATION_QUEUE_LIVE_INVENTORY_20260911.json`  
- `docs/evidence/S0_CUT2_DOMAIN_ENQUEUE_MATRIX_20260911.json`  

**SR1 follow-up (Chief interim evidence, 2026-09-11):** R11–R16 + domain matrix folded with verified generic-relay callers, sms-sender chain, live MCP tenant columns (`payment_obligations` absent), WA_TEMPLATES, and SMS semantic renderers. `data.groupId` is never authorization.

---

## Pins (do not drift)

| Pin | Value |
|-----|-------|
| This revision parent tip | `1478c33129502026346f8fb386614f6c66b9836c` |
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

### Channel

`whatsapp` | `sms` | `email`. `push` denied.

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

## R5 — Server-owned content

RPC / producer builds `data` jsonb **after** loading the domain row:

- `recipient` = derived E.164 (R7)
- `user_id` = membership.user_id or NULL
- `groupId` = **derived** tenant (storage only; **NEVER** an authorization source — emit only after R3 derivation)
- type-specific keys already used by producers (`paymentId`, `obligationId`, …)
- `whatsappType` = `p_notification_type`
- `whatsappData` = fields from DB (`getMemberName`, `formatAmount`, group name, …)
- `template` = Meta name from R4
- `locale` = `p_locale` or `profiles.preferred_locale`

**No** browser free-form `message`, Meta `components`, or caller `whatsappData`.

Drain `processWhatsApp` uses `whatsappType` + `whatsappData` (typed dispatch). Drain `processSms` uses a **server-rendered** `data.message` written by the RPC from `sms-templates` (same switch as `buildMessage`). Drain must not accept a caller-supplied raw SMS body that did not come from that renderer.

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

## R10 — Idempotency (FAILED = terminal)

Existing unique indexes (do not DROP). Conflict target = those expressions. Behavior:

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

**Disposition (either is PASS; generic body is FAIL):**

- **Preferred:** **REMOVE** the route — return **410**. No AT, no queue, no UUID→phone.
- **Only alternative:** convert to domain-bound `{notification_type, domain_object_id, recipient_membership_id?, locale?}` that calls the enqueue adapter. **No** `to` / phone / `template` / free-form `data`.

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

**Disposition:** **CLOSE all three branches → 410** (preferred). If a WhatsApp HTTP route survives, it MUST be domain-bound IDs only (same shape as SMS alternative) and must **not** call Meta or INSERT the queue.

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
| `/api/sms/send` | **REMOVE generic (410)** or domain-bound IDs only. No phone/template/data. |
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

Must include: A1–A5 client INSERT/UPDATE/TRUNCATE DENY; A6 service_role table INSERT DENY; A7 RPC allowlisted inserted; A8 unknown type denied; A9 missing domain row denied; A10 fan-out without membership denied; A11 foreign membership denied; A12 trusted `groupId` smuggle impossible (no param; `data.groupId` not authz); A13 phone param impossible; A14 invitation NULL user inserted; A15 failed-row re-enqueue duplicate; A16 authenticated EXECUTE denied; A17 staff UPDATE denied; A18 `/api/sms/send` generic `{to,template,data}` 410 (or 400 if domain-bound-only conversion); A19 `/api/whatsapp/send` typed **and** `{template,components}` **and** `{text}` 410; A20 proxy-claim request phone ≠ DB phone → enqueue uses DB or denied; A21 proxy-claim inactive membership (`membership_status <> 'active'`) denied.

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
**CREATE UNIQUE INDEX IF NOT EXISTS:** SMS/email twins + new types (R10). **Do not DROP** existing WhatsApp uniques.  
**Preconditions (`CUT2_ABORT`):** Cut 1 version `20260911183755` present; live INSERT policy name/check as pinned; enum has no `processing`; no `group_id` column; `to_regclass('public.notification_policies')` IS NULL; expected WhatsApp unique index names present; `sms-sender` on implementation tip must not still INSERT via `@/lib/supabase/server` (static check).  
**Never:** DELETE FROM `notifications_queue`; retry failed; edit `00001`–`00114`.

---

## R30 — PR #69 / #70 / Cut 3 / M2 / F3-06

Untouched / unapplied. Cut 2 static allowlist ≠ policy tables. Cut 3 storage not started. M2 quiet-hours `DEFER_UNTIL` not started. F3-06 not started. Cut 1 unmodified.

---

## Daybreak handoff

| Gate | Result |
|------|--------|
| Layer B only; Layer A removed | PASS |
| Exact RPC signature | PASS — R2 |
| Domain matrix complete; unknown named producers = 0 | PASS — R3 + matrix JSON |
| Relays closed including direct Meta | PASS — R11–R16 |
| Dual-compat error `42883` / `PGRST202` | PASS — R27 |
| App-first then 00115 | PASS — R28 |
| No SQL / no runtime in this PR | PASS |
| PR #69/#70/Cut 3/Cut 1 | PASS — R30 |

### HOLD blockers

**Open count: 0** for this contract.  
Implementation-time aborts remain: missing unique index; sms-sender still cookie-INSERT; `notification_policies` present; Layer-B INSERT grant left on service_role.

---

## Non-goals / STOP

No implementation, no `00115` file, no prod write, no sends, no failed retry, no #69/#70/#71 merge, no Cut 3/M2/F3-06, no Cut 1 edit, no Layer A apply, no GRANT enqueue to `authenticated`, no re-open `/api/whatsapp/send` “just for typed”.
