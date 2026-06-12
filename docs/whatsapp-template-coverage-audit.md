# WhatsApp Template Coverage Audit

Date: 2026-06-10

Scope: read-only audit of VillageClaq WhatsApp template mappings, Meta approval status, language coverage, variable order, routing, queue/webhook observability, and launch/manual-QA readiness.

No WhatsApp, email, or SMS messages were sent for this audit. No Meta configuration, Vercel deployment, migration, domain, queue retry, or production data mutation was performed.

## Executive Summary

The app currently defines 21 WhatsApp notification types in `src/lib/whatsapp-dispatcher.ts` and maps them through `src/lib/whatsapp-templates.ts`.

Meta Graph read-only inventory found 38 approved language rows across 20 template names. Of the 21 app template types:

- 14 are ready for controlled manual QA in both English and French.
- 1 is approved for English only and must be held for French users.
- 6 are referenced by app code but do not currently exist as approved Meta templates.
- 0 approved app templates have a variable-count mismatch.
- 0 approved app templates have an app builder order mismatch by Meta placeholder number.

The four launch-critical v2 templates are approved, mapped, and variable-compatible:

- `villageclaq_payment_reminder_v2`
- `villageclaq_payment_receipt_v2`
- `villageclaq_announcement_v2`
- `villageclaq_event_reminder_v2`

The payment receipt v2 path is the strongest operational path because it is queue-backed, idempotent, stores the Meta provider message ID, and receives webhook status updates back into `notifications_queue.data.latestProviderStatus`.

Several other WhatsApp paths still route through direct or client-initiated sends. Those can send if Meta approves the template, but they do not all persist provider message IDs to queue rows, so callback status cannot always be correlated to a durable queue row.

## Method

Inputs used:

- Code inventory from `src/lib/whatsapp-templates.ts`
- Dispatcher inventory from `src/lib/whatsapp-dispatcher.ts`
- Producer and route search for `whatsappType`, `dispatchWhatsApp`, `dispatchWhatsAppWithResult`, and `sendWhatsAppMessage`
- Meta Graph API read-only `/{WABA_ID}/message_templates`
- Static safety checks in `scripts/audit-whatsapp.mjs`

Meta data captured:

- Template name
- Category
- Status
- Language
- Component types
- Body placeholder count and placeholder numbers
- Footer presence
- Button count

Secrets, tokens, provider payloads, and full phone numbers were not captured in this document.

## Current App Template Inventory

| App type | Constant | Meta template | Category | EN | FR | App variable order | Meta variable count | Producer path | Send path | Webhook tracking | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `payment_receipt` | `PAYMENT_RECEIPT` | `villageclaq_payment_receipt_v2` | UTILITY | yes | yes | `memberName`, `amount`, `contributionType`, `groupName`, `date` | 5 | `src/lib/payment-receipt-producer.ts` | queue drain via `notifications_queue` | yes, queue row updated by `providerMessageId` | Ready |
| `payment_reminder` | `PAYMENT_REMINDER` | `villageclaq_payment_reminder_v2` | UTILITY | yes | yes | `memberName`, `amount`, `contributionType`, `dueDate`, `groupName` | 5 | `src/lib/payment-reminder-producer.ts` called by the daily cron (see addendum 4) | queue-backed (`notifications_queue`) | provider ID + webhook status correlated via queue row | Apply migration 00090 before QA |
| `event_reminder` | `EVENT_REMINDER` | `villageclaq_event_reminder_v2` | MARKETING | yes | yes | `memberName`, `eventTitle`, `eventDate`, `eventLocation`, `groupName` | 5 | `src/app/api/cron/event-reminders/route.ts` | awaited direct dispatch with result | webhook row can persist, but no queue row for direct sends | Ready for template QA; observability gap |
| `hosting_reminder` | `HOSTING_REMINDER` | `villageclaq_hosting_reminder` | UTILITY | yes | yes | `memberName`, `hostingDate`, `groupName` | 3 | hosting cron and hosting UI | direct dispatch or client route | limited for direct/client sends | Ready for template QA; routing hardening later |
| `minutes_published` | `MINUTES_PUBLISHED` | `villageclaq_minutes_published` | MARKETING | yes | yes | `groupName`, `meetingTitle`, `meetingDate` | 3 | minutes page via `notifyFromClient` | client route `/api/whatsapp/send` | no durable queue correlation unless queued on retry | Ready for template QA; routing hardening later |
| `relief_claim_approved` | `RELIEF_CLAIM_APPROVED` | `villageclaq_relief_claim_approved` | UTILITY | yes | yes | `memberName`, `claimType`, `amount`, `groupName` | 4 | `src/lib/relief-claim-decision-producer.ts` via `/api/relief/claim-notifications` (see addendum 7) | queue-backed (`notifications_queue`) | provider ID + webhook status correlated via queue row | Apply migration 00093; verify live Meta category before US QA |
| `relief_claim_denied` | `RELIEF_CLAIM_DENIED` | `villageclaq_relief_claim_denied` | UTILITY | yes | yes | `memberName`, `claimType`, `reason`, `groupName` | 4 | `src/lib/relief-claim-decision-producer.ts` via `/api/relief/claim-notifications` (see addendum 7) | queue-backed (`notifications_queue`) | provider ID + webhook status correlated via queue row | Apply migration 00093; verify live Meta category before US QA |
| `announcement` | `ANNOUNCEMENT` | `villageclaq_announcement_v2` | MARKETING | yes | yes | `groupName`, `title`, `body` | 3 | announcements page, scheduled announcement cron, enterprise transfers | client route or direct cron dispatch | limited for direct/client sends | Ready for template QA; routing hardening later |
| `election_opened` | `ELECTION_OPENED` | `villageclaq_election_opened` | MARKETING | yes | yes | `groupName`, `electionTitle`, `positions` | 3 | elections page via `notifyFromClient` | client route `/api/whatsapp/send` | no durable queue correlation unless queued on retry | Ready for template QA; routing hardening later |
| `invitation` | `INVITATION` | `villageclaq_invitation` | MARKETING | yes | yes | `inviterName`, `groupName`, `acceptUrl` | 3 | superseded — legacy type retained for historical rows only (see addendum 8) | none (old inline path removed; was dead code) | n/a | Superseded by `member_invitation`; never use for live sends |
| `member_invitation` | `MEMBER_INVITATION` | `villageclaq_member_invitation_notice` | UTILITY | yes | yes | `inviteeName`, `groupName`, `invitationLink` | 3 | `src/lib/member-invitation-producer.ts` via `/api/invitations/whatsapp-notifications` (see addendum 8) | queue-backed (`notifications_queue`) | provider ID + webhook status correlated via queue row | Apply migration 00094 before QA |
| `loan_approved` | `LOAN_APPROVED` | `villageclaq_loan_approved` | UTILITY | yes | yes | `memberName`, `amount`, `groupName` | 3 | `src/lib/loan-approved-producer.ts` via `/api/loans/approval-notifications` (see addendum 7) | queue-backed (`notifications_queue`) | provider ID + webhook status correlated via queue row | Apply migration 00093 before QA |
| `loan_overdue` | `LOAN_OVERDUE` | `villageclaq_loan_overdue` | UTILITY | yes | yes | `memberName`, `amount`, `dueDate`, `groupName` | 4 | `src/lib/loan-overdue-producer.ts` via the daily 10:00 UTC cron (see addendum 8) | queue-backed (`notifications_queue`) | provider ID + webhook status correlated via queue row | Apply migration 00094 before QA |
| `fine_issued` | `FINE_ISSUED` | `villageclaq_fine_issued` | UTILITY | yes | yes | `memberName`, `fineType`, `amount`, `groupName`, `reason` | 5 | `src/lib/fine-issued-producer.ts` via `/api/fines/issued-notifications` (see addendum 7) | queue-backed (`notifications_queue`) | provider ID + webhook status correlated via queue row | Apply migration 00093 before QA ({{4}}/{{5}} order verified in WhatsApp Manager 2026-06-11) |
| `standing_changed` | `STANDING_CHANGED` | `villageclaq_standing_changed` | UTILITY | yes | yes | `memberName`, `newStanding`, `groupName` | 3 | `src/lib/standing-change-producer.ts` via `/api/members/standing-notifications` (see addendum 6) | queue-backed (`notifications_queue`) | provider ID + webhook status correlated via queue row | Apply migration 00091 before QA |
| `welcome` | `WELCOME` | `villageclaq_member_joined` (was `villageclaq_welcome`, see addendum 2) | UTILITY | yes | yes | `memberName`, `groupName` | 2 | `src/lib/welcome-producer.ts` via `/api/members/welcome-notifications` | queue-backed (`notifications_queue`) | provider ID + webhook status correlated via queue row | Default `new_member` prefs keep WhatsApp off; enable for QA |
| `hosting_assignment` | `HOSTING_ASSIGNMENT` | `villageclaq_hosting_reminder` (reused; see addendum 3) | UTILITY | yes | yes | `memberName`, `hostingDate`, `groupName` | 3 | `src/lib/hosting-assignment-producer.ts` via `/api/hosting/assignment-notifications` | queue-backed (`notifications_queue`) | provider ID + webhook status correlated via queue row | Apply migration 00089 before QA |
| `relief_enrollment` | `RELIEF_ENROLLMENT` | `villageclaq_plan_enrollment_confirmed` (was `villageclaq_relief_enrollment`, see addendum 5) | UTILITY | yes | yes | `memberName`, `planName`, `groupName` | 3 | `src/lib/relief-enrollment-producer.ts` via `/api/relief/enrollment-notifications` | queue-backed (`notifications_queue`) | provider ID + webhook status correlated via queue row | Migration 00089 applied; ready for QA re-run |
| `remittance_confirmed` | `REMITTANCE_CONFIRMED` | `villageclaq_remittance_confirmed` | UTILITY (confirmed in WhatsApp Manager 2026-06-12) | yes | yes | `amount`, `groupName` | 2 | `src/lib/remittance-decision-producer.ts` via `/api/relief/remittance-notifications` (see addendum 10) | queue-backed (`notifications_queue`), one row per branch admin | provider ID + webhook status correlated via queue row | Apply migration 00096 before QA |
| `remittance_disputed` | `REMITTANCE_DISPUTED` | `villageclaq_remittance_disputed` | UTILITY (confirmed in WhatsApp Manager 2026-06-12) | yes | yes | `amount`, `groupName` | 2 | `src/lib/remittance-decision-producer.ts` via `/api/relief/remittance-notifications` (see addendum 10) | queue-backed (`notifications_queue`), one row per branch admin | provider ID + webhook status correlated via queue row | Apply migration 00096 before QA |
| `subscription_expiring` | `SUBSCRIPTION_EXPIRING` | `villageclaq_subscription_expiring` | missing | no | no | `planName`, `days` | missing | subscription reminders cron | direct dispatch | no durable queue correlation | Hold: missing Meta approval |
| `proxy_claim` | `PROXY_CLAIM` | `villageclaq_proxy_claim` | missing | no | no | `memberName`, `groupName`, `claimUrl` | missing | `src/app/api/proxy-claim/send/route.ts` | direct dispatch | no durable queue correlation | Hold: missing Meta approval |

## Meta Approval Status

Ready in EN and FR:

- `villageclaq_payment_receipt_v2`
- `villageclaq_payment_reminder_v2`
- `villageclaq_event_reminder_v2`
- `villageclaq_hosting_reminder`
- `villageclaq_minutes_published`
- `villageclaq_relief_claim_approved`
- `villageclaq_relief_claim_denied`
- `villageclaq_announcement_v2`
- `villageclaq_election_opened`
- `villageclaq_invitation`
- `villageclaq_loan_approved`
- `villageclaq_loan_overdue`
- `villageclaq_fine_issued`
- `villageclaq_standing_changed`

Approved in EN only:

- `villageclaq_welcome`

Referenced by app code but not approved/present in Meta:

- `villageclaq_hosting_assignment`
- `villageclaq_relief_enrollment`
- `villageclaq_remittance_confirmed`
- `villageclaq_remittance_disputed`
- `villageclaq_subscription_expiring`
- `villageclaq_proxy_claim`

Approved in Meta but not used by the app:

- `villageclaq_payment_receipt`
- `villageclaq_payment_reminder`
- `villageclaq_event_reminder`
- `villageclaq_announcement`
- `villageclaq_welcome_`

The unused first four are expected legacy names after the v2 migration. `villageclaq_welcome_` appears to be an extra Meta-side name and is not referenced by code.

## Variable Order Review

App builders pass variables in the same numeric order Meta expects. For example:

- Payment receipt app order: `{{1}} memberName`, `{{2}} amount`, `{{3}} contributionType`, `{{4}} groupName`, `{{5}} date`
- Payment reminder app order: `{{1}} memberName`, `{{2}} amount`, `{{3}} contributionType`, `{{4}} dueDate`, `{{5}} groupName`
- Announcement app order: `{{1}} groupName`, `{{2}} title`, `{{3}} body`
- Event reminder app order: `{{1}} memberName`, `{{2}} eventTitle`, `{{3}} eventDate`, `{{4}} eventLocation`, `{{5}} groupName`

The v2 template body text intentionally displays the group placeholder first in some templates, such as `{{4}}` or `{{5}}` near the top. This is safe because Meta binds values by placeholder number, not by the visual order of placeholders in the message body.

No approved current app template has a variable-count mismatch.

## Language Handling

The dispatcher sends `fr` only when the selected locale is exactly `fr`; all other values fall back to `en`.

Safe behavior:

- Missing or unknown locale falls back to English.
- The four v2 launch-critical templates have both EN and FR approved.
- Most approved non-v2 templates also have both EN and FR approved.

Risk:

- `welcome` has no FR template row. A French recipient would request `fr` and Meta would reject the send.
- The six missing template names have no EN or FR row and should not be tested live until approved.

## Producer And Routing Coverage

Queue-backed and webhook-correlatable:

- `payment_receipt` from `src/lib/payment-receipt-producer.ts`
- Any message already in `notifications_queue` and sent by `src/app/api/cron/drain-notification-queue/route.ts`

Awaited direct dispatch with provider result but no durable queue row:

- `payment_reminder`
- `event_reminder`

Awaited direct dispatch without durable provider ID persistence:

- `hosting_reminder`
- `announcement` from scheduled-announcement cron
- `subscription_expiring`
- `proxy_claim`

Client-initiated route sends through `/api/whatsapp/send`:

- `announcement`
- `hosting_assignment`
- `hosting_reminder`
- `minutes_published`
- `relief_claim_approved`
- `relief_claim_denied`
- `relief_enrollment`
- `remittance_confirmed`
- `remittance_disputed`
- `loan_approved`
- `fine_issued`
- `election_opened`
- legacy client payment receipt call sites

Those client paths call a server API route, so Meta credentials stay server-side. However, the browser helper is fire-and-forget and does not persist the returned provider message ID to a queue row. If Meta sends a status webhook for those direct sends, the webhook table can store the event, but `notifications_queue.data.latestProviderStatus` cannot be updated without a queue row containing that provider ID.

## Safety And Observability Review

Confirmed:

- `src/lib/send-whatsapp.ts` masks phone numbers in server logs.
- `src/app/api/whatsapp/send/route.ts` masks phone numbers and shortens UUIDs in server logs.
- Webhook signature validation uses the raw request body and `X-Hub-Signature-256`.
- Webhook persistence sanitizes phone-bearing fields before storing raw events.
- Queue drain stores `providerMessageId` and `providerStatus` for successful queue sends.
- Payment receipt idempotency is strict exactly-once by `payment_receipt:<paymentId>`.
- Queue retry behavior does not retry old rows during this audit.

Updated in this PR:

- `src/lib/notify-client.ts` now masks `recipientPhone` in client diagnostics.
- `scripts/audit-whatsapp.mjs` now statically audits all 21 current app template mappings and variable-builder orders.

Remaining risks:

- Direct/client sends do not have durable provider ID correlation.
- Several direct paths use boolean dispatch, so failures are not as observable as queue-backed sends.
- Six app-referenced template names are missing from Meta.
- `welcome` is missing FR.

## Manual QA Readiness

Ready for controlled manual QA:

- EN/FR payment receipt
- EN/FR payment reminder
- EN/FR announcement
- EN/FR event reminder
- EN/FR hosting reminder
- EN/FR minutes published
- EN/FR relief claim approved
- EN/FR relief claim denied
- EN/FR election opened
- EN/FR invitation
- EN/FR loan approved
- EN/FR loan overdue
- EN/FR fine issued
- EN/FR standing changed

Hold back from live WhatsApp QA:

- FR welcome, until `villageclaq_welcome` is approved in FR or code falls back to EN for that template.
- Hosting assignment, until `villageclaq_hosting_assignment` is approved in EN/FR.
  *(Superseded by addendum 3: `hosting_assignment` now reuses the approved
  `villageclaq_hosting_reminder` and is producer-backed.)*
- Relief enrollment, until `villageclaq_relief_enrollment` is approved in EN/FR.
  *(Superseded by addendum 3: the template was approved EN/FR and is now
  producer-backed.)*
- Remittance confirmed, until `villageclaq_remittance_confirmed` is approved in EN/FR.
- Remittance disputed, until `villageclaq_remittance_disputed` is approved in EN/FR.
- Subscription expiring, until `villageclaq_subscription_expiring` is approved in EN/FR.
- Proxy claim, until `villageclaq_proxy_claim` is approved in EN/FR.

## Recommended Manual Test Cases

Run only after explicit send authorization, one template/language at a time, with a controlled recipient. Verify phone receipt, Meta `wamid...`, webhook status row, and log masking.

| Template | EN test | FR test | Notes |
| --- | --- | --- | --- |
| `payment_receipt` | Confirm one controlled payment | Confirm one controlled payment with FR locale | Use the queue-backed producer path first |
| `payment_reminder` | One controlled overdue obligation | Same with FR locale | Direct cron path; provider ID is not durably queued |
| `announcement` | One controlled announcement | Same with FR localized title/body | Client/scheduled paths differ; test both later |
| `event_reminder` | One controlled event reminder | Same with FR locale | Direct cron path |
| `hosting_reminder` | One controlled hosting reminder | Same with FR locale | Direct dispatch boolean path |
| `minutes_published` | Publish one controlled minutes notice | Same with FR locale | Client route path |
| `relief_claim_approved` | Controlled claim approval | Same with FR locale | Client route path |
| `relief_claim_denied` | Controlled claim denial | Same with FR locale | Client route path |
| `election_opened` | Controlled election opening | Same with FR locale | Client route path |
| `invitation` | Controlled invitation | Same with FR locale | Confirm producer path before live send |
| `loan_approved` | Controlled loan approval | Same with FR locale | Client route path |
| `loan_overdue` | Controlled overdue loan | Same with FR locale | Confirm producer path before live send |
| `fine_issued` | Controlled fine issue | Same with FR locale | Client route path |
| `standing_changed` | Controlled standing update | Same with FR locale | Confirm producer path before live send |

Do not live-test the hold-back templates until Meta approval gaps are closed.

## Recommended Next Steps

1. Submit or approve the missing Meta templates in EN and FR:
   - `villageclaq_hosting_assignment` *(superseded by addendum 3 — never
     submitted; `hosting_assignment` reuses `villageclaq_hosting_reminder`)*
   - `villageclaq_relief_enrollment` *(approved; producer-backed per addendum 3)*
   - `villageclaq_remittance_confirmed`
   - `villageclaq_remittance_disputed`
   - `villageclaq_subscription_expiring`
   - `villageclaq_proxy_claim`
2. Add FR for `villageclaq_welcome`, or add a documented EN fallback for this one template.
3. Move high-value client/direct WhatsApp flows toward queue-backed producers so provider IDs and webhook statuses are durably correlated.
4. Prefer `dispatchWhatsAppWithResult` over boolean `dispatchWhatsApp` in server paths that must produce audit counts.
5. Begin manual QA with the 14 EN/FR-ready templates, starting with the four v2 launch-critical templates.

## Addendum (2026-06-10, post-approval follow-up)

This audit was a point-in-time snapshot. Two welcome findings are superseded:

- FR approval: `villageclaq_welcome` is now approved in EN and FR (see
  `docs/whatsapp-missing-template-copy.md`). The "Hold for FR users" notes at
  lines above no longer apply.
- Producer path: a server-side, queue-backed welcome producer now exists —
  `src/lib/welcome-producer.ts`, triggered via `/api/members/welcome-notifications`
  from invitation acceptance, proxy claim (invitation and token link), and
  join-code success. Recipient is the joining member only; `new_member`
  preferences gate the send (default WhatsApp OFF); idempotency is one welcome
  per membership (check-before-insert plus migration 00088 unique index).
  Tested by `npm run test:welcome-producer` and audited by `npm run audit:whatsapp`.

## Addendum 2 (2026-06-11, post-QA: Utility remap and pay-now hardening)

- Controlled EN welcome QA (2026-06-11) proved the pipeline end to end (queue row →
  drain send → `providerMessageId` → webhook correlation → idempotency), but Meta
  blocked delivery with error `131049`: `villageclaq_welcome` is MARKETING and Meta
  pauses marketing templates to US numbers. See
  `docs/whatsapp-welcome-utility-template.md` for the full analysis.
- `villageclaq_member_joined` (UTILITY) was approved in Meta for EN and FR, and the
  app's `welcome` type now maps to it (`WA_TEMPLATES.WELCOME`). Variable order is
  unchanged (`memberName`, `groupName`); EN/FR selection is unchanged. The old
  `villageclaq_welcome` MARKETING template is unused by code and can be retired in
  Meta once this mapping is deployed.
- Pay-now receipt path hardened: `pay-now-dialog.tsx` no longer sends a client-side
  WhatsApp `payment_receipt` at submission time (the payment is still
  `pending_confirmation`). The receipt is produced by the server-side queue-backed
  producer when an admin confirms the payment (`contributions/history` →
  `/api/payments/receipt-notifications`, whose authorization now also accepts active
  group owners/admins of the payment's group). Exactly-once per payment is preserved
  (queue dedupe + migration 00087 unique index).
- Ready for manual QA: `welcome` (re-run a fresh join for the QA recipient; expect
  delivered/read now that the template is UTILITY) and the pay-now → confirm receipt
  flow. Formerly held, now resolved in addendum 3: `relief_enrollment` (producer sent blank `memberName`; needed a
  server-side queue-backed producer — separate PR) and `hosting_assignment` (mapped
  Meta template name does not exist; remap to `villageclaq_hosting_reminder` plus a
  per-recipient payload producer — separate PR).

## Addendum 3 (2026-06-11, relief enrollment + hosting assignment producerization)

- `relief_enrollment` is now producer-backed: `src/lib/relief-enrollment-producer.ts`
  via `/api/relief/enrollment-notifications` (group owner/admin or platform staff,
  batch-capped). Triggered fire-and-forget from all three enrollment paths —
  the enrollment page (which previously sent a shared payload with a hardcoded
  blank `memberName` that Meta rejects), plan auto-enroll, and the admin
  bulk-enroll dialog (both of which previously notified nobody). Variables
  `memberName`, `planName` (`name_fr` for FR), `groupName` are resolved
  server-side per recipient and are never blank. Recipient is the enrolled
  member only; proxy members included via `proxy_phone`; gated by
  `relief_updates` preferences (WhatsApp default ON). Exactly-once per
  enrollment (`data->>enrollmentId` check-before-insert + migration 00089).
- `hosting_assignment` is now mapped to the approved EN/FR
  `villageclaq_hosting_reminder` (identical 3-variable body; a distinct
  assignment template remains a future copy upgrade) and producer-backed:
  `src/lib/hosting-assignment-producer.ts` via
  `/api/hosting/assignment-notifications`. Triggered from publish-schedule and
  the assign-hosts dialog; only `upcoming`, non-past assignments are notified
  (re-publishing never re-sends); `hostingDate` is formatted per recipient
  locale, mirroring the hosting-reminders cron. Gated by `hosting_reminders`
  preferences. Exactly-once per assignment (`data->>assignmentId`
  check-before-insert + migration 00089). The hosting-reminders cron and the
  swap-flow `hosting_reminder` sends are unchanged.
- Migration `00089_relief_hosting_notification_idempotency.sql` is committed
  but NOT applied — run it in the SQL Editor before live QA.
- Remaining direct/client WhatsApp paths for later conversion: announcements
  (bulk, marketing-category), payment-reminders cron, `standing_changed`
  (client-side recalculation), invitations, fines/loans/relief-claims/
  remittances single-recipient sends, event/subscription/scheduled-announcement
  crons, and the proxy-claim route (lowest priority — result surfaced to UI).
- No live messages were sent in the production of this addendum; all
  verification is static or mocked.

## Addendum 4 (2026-06-11, payment reminder cron producerization)

- The daily payment-reminders cron (08:00 UTC) previously dispatched WhatsApp
  **directly** per overdue obligation: provider message IDs were captured and
  then dropped (no queue row, no webhook correlation), and the cron had **zero
  dedup** — a same-day rerun or retry duplicated every channel.
- WhatsApp now flows through `src/lib/payment-reminder-producer.ts`, called by
  the cron per overdue obligation. Template mapping is unchanged
  (`villageclaq_payment_reminder_v2`, UTILITY) and the variable order is
  `memberName`, `amount`, `contributionType`, `dueDate`, `groupName`. Amount is
  the outstanding balance (`amount - amount_paid`); `name_fr` is used for
  French recipients; the recipient's `preferred_locale` wins. Eligibility is
  re-checked at produce time (`pending/partial/overdue`, due date passed,
  balance > 0 — note no trigger ever sets `overdue`, so the producer must not
  require it). Proxy members remain excluded (cron parity), non-active
  memberships are skipped, and blank template variables are impossible.
- **Idempotency is a day bucket, deliberately different from the other
  producers**: one WhatsApp reminder per obligation per UTC `reminderDate`.
  Same-day reruns/retries/races are blocked; the next scheduled day reminds
  again, preserving the daily cadence. Backed by migration
  `00090_payment_reminder_notification_idempotency.sql` (committed, NOT
  applied — run in the SQL Editor before live QA).
- Email and SMS reminder paths are unchanged (and remain non-idempotent on
  same-day reruns — pre-existing, out of scope here). Delivery timing shifts
  from 08:00 directly to the queue drain, which processes 50 rows per
  15-minute tick (~200/hour, FIFO, shared with receipts/welcome/relief/
  hosting): small groups deliver within ~15 minutes, but an 08:00 burst of N
  reminders finishes roughly N/200 hours later and delays other queued
  messages behind it — a known head-of-line trade-off, acceptable at current
  volumes. Two further accepted windows: a member who pays between enqueue
  and the drain tick still receives that day's reminder (the drain does not
  re-validate obligations — the old direct path had the same window, only
  narrower), and a day-D row still retrying when day D+1 enqueues can deliver
  two reminders close together (requires ~24h of drain backlog; rare).
- Deliberate behavior deltas from the old WhatsApp path: the cron-level phone
  pre-filter was dropped (the producer's broader phone resolution — profile →
  membership → auth — may reach members the old contacts-RPC-only path
  missed), and `pending_approval`/suspended memberships are now skipped for
  WhatsApp (the old path only excluded `exited`; email/SMS behavior for them
  is unchanged).
- Remaining direct/client WhatsApp paths for later conversion: announcements
  (bulk, marketing-category), `standing_changed`, invitations,
  fines/loans/relief-claims/remittances single-recipient sends,
  event/subscription/scheduled-announcement crons, and the proxy-claim route.
- No live messages were sent in the production of this addendum; all
  verification is static or mocked.

## Addendum 5 (2026-06-11, relief enrollment Utility remap)

- The 2026-06-11 controlled relief QA proved the producer pipeline end to end
  but Meta blocked delivery with error `131049`: `villageclaq_relief_enrollment`
  was silently approved as **MARKETING**, and Meta pauses marketing templates
  to US numbers (the same failure signature the original welcome template had).
- The UTILITY replacement `villageclaq_plan_enrollment_confirmed` is now
  approved in Meta for EN and FR, and `WA_TEMPLATES.RELIEF_ENROLLMENT` maps to
  it. Variable order is unchanged (`memberName`, `planName`, `groupName`);
  EN/FR selection and the per-enrollment idempotency (migration 00089,
  applied) are unchanged — the dispatcher resolves the template at send time,
  and the failed QA row from the MARKETING template is terminal and is NOT
  retried.
- The old `villageclaq_relief_enrollment` MARKETING template is unused by code
  and can be retired in Meta once this mapping is deployed.
- No live messages were sent in the production of this addendum; all
  verification is static or mocked.

## Addendum 6 (2026-06-11, standing-change producerization + membership_status freeze)

- `standing_changed` WhatsApp was a client-side direct send from
  `src/lib/calculate-standing.ts` with **no dedup** (concurrent recalcs from
  multiple tabs / admin+member could double-send) and a **latent bug**: it
  passed `newStatus` where the dispatcher reads `newStanding`, so the
  template's `{{2}}` was empty and Meta rejected every send. Now a
  server-side queue-backed producer (`src/lib/standing-change-producer.ts` via
  `/api/members/standing-notifications`) resolves `memberName`, the
  recipient-localized standing label, and `groupName` server-side — the
  variable-key bug is fixed by construction and provider IDs / webhook status
  are tracked. In-app/email/SMS behavior in calculate-standing is unchanged
  (only the WhatsApp block was swapped).
- Template/category unchanged (`villageclaq_standing_changed`, UTILITY, no US
  marketing-pause exposure); variable order `memberName`, `newStanding`,
  `groupName`. The standing value is now localized per recipient (`Good`/`Bon`,
  `Suspended`/`Suspendu`, etc.) rather than the raw English enum.
- Idempotency is a per-membership, per-standing, per-UTC-day bucket
  (`data->>membershipId` + `data->>newStanding` + `data->>changeDate`), backed
  by migration `00091` (committed, NOT applied). Same-day recalc races dedupe;
  a later transition to a different standing still notifies.
- Authorization on the route: the affected member, an active group
  owner/admin of the membership's group, or platform staff.
- Known coverage gap (documented, out of scope): DB-trigger standing changes
  (migrations 00079/00080) update `memberships.standing` silently and consume
  the old→new delta, so the client transition gate never fires for them — those
  changes still notify nobody. A future server-side trigger-to-queue path would
  close this.
- Security (Part 2, not a WhatsApp item): migration `00092` adds
  `membership_status` to the `prevent_membership_self_escalation()` freeze list
  (carving out self-exit) — defense-in-depth against an `exited` former admin
  self-reinstating to `active`. NOTE: the gap is **latent on current prod** —
  the live `membership_status` CHECK constraint only allows
  `active`/`pending_approval` (verified read-only), so no `exited` row can exist
  and the attack is not yet reachable; `00092` should be sequenced with widening
  that constraint (a separate, broader change out of this PR's scope). Full
  analysis incl. the `unsuspend_platform_user` caveat in
  `src/MEMBERSHIP_STATUS_FREEZE_AUDIT.md`.
- Migration `00091` (standing idempotency) must be applied before live standing
  QA. Migration `00092` is forward-looking and can be applied alongside the
  constraint widening. No live messages were sent; all verification is static or
  mocked.

## Addendum 7 (2026-06-11, money-path producerization: fines, loans, relief claims)

- All three money paths were client-side fire-and-forget `notifyFromClient`
  sends with **no dedup anywhere** (double-click/refresh/two-admin races
  double-sent), provider message IDs dropped, the ADMIN's locale instead of
  the recipient's, and client-cache blank-variable risks (`memberName`/
  `fineType`/`groupName` could be `""` on cache misses — Meta rejects blank
  body parameters). The relief **plans** page additionally decided claims
  with NO notification at all (silent approve/deny).
- Three new queue-backed producers, each triggered via an authz'd route
  (affected member / active group owner-admin / platform staff) and reading
  ALL content authoritatively from the DB:
  - `fine_issued` — exactly-once per `fineId`; the fines page now captures
    the inserted fine id. `reason` falls back to `-` (old-path parity).
  - `loan_approved` — exactly-once per `loanId`; accepts
    approved/disbursed/repaying (the UI jumps approved→repaying); amount is
    the APPROVED amount. The approval UPDATE now carries a
    `.eq("status","pending")` precondition, and **quick loans now send the
    WhatsApp approval notice too** (previously in-app only — deliberate
    behavior change).
  - `relief_claim_approved`/`relief_claim_denied` — keyed per
    **(claimId, decision template)**: same-decision reruns dedupe, a genuine
    reversal still notifies once per decision. A denial with an empty review
    reason (reachable from the plans page) skips as `missing_template_data`.
    `claimType` is the plan name, localized via `name_fr` for FR recipients.
    relief_claims has no `group_id` — the plan's group is used throughout,
    with no membership/plan group-mismatch skip (shared/HQ plans).
- Proxy members are INCLUDED in all three (privacy_settings.proxy_phone),
  matching the old client paths. Recipient `preferred_locale` now wins
  (previously the deciding admin's UI locale). In-app/email/SMS stay on the
  legacy client path — with one cleanup: `notifyFromClient`'s typed in-app
  insert is now disabled (`inApp: false`) because `fine`/`loan`/`relief`
  were never valid `notification_type` enum values, so that insert always
  failed silently against the DB; the pages' direct `type: "system"` insert
  is and was the one real in-app row. The loans approve flow additionally
  bails out (no notifications, no audit log, visible "already decided"
  error) when its status precondition matches zero rows, so a stale approve
  after another admin's decision no longer emails/SMSes "approved".
- Channel asymmetry note: the relief PLANS page decision surface sends
  WhatsApp only (it previously sent nothing) — in-app/email/SMS for that
  surface remain absent, unlike the claims page which sends all channels.
  Also: that page is gated by the `relief.manage` permission, which can
  include non-owner/admin position holders — but relief_claims UPDATE RLS is
  owner/admin-only, so such users' decisions never persist and the producer
  route's owner/admin authz is not a real coverage gap.
- **Fine template order — RESOLVED (2026-06-11)**: the approved Meta body
  for `villageclaq_fine_issued` was manually verified in WhatsApp Manager
  (EN + FR, both UTILITY): **{{4}} = groupName, {{5}} = reason**, exactly as
  `docs/WHATSAPP_TEMPLATES.md` documents. `buildFineIssuedParams` originally
  emitted those two swapped and was corrected in this PR; the producer's
  whatsappData, the audit registry, and the tests now all assert the
  approved order. No live fine WhatsApp had ever been sent through the old
  swapped emission.
- Claim-template category caution: both doc sources say the claim templates
  are UTILITY and they are from the original launch batch (not the 2026-06
  batch that was silently MARKETING), but verify the live category in
  WhatsApp Manager before US-number QA — precedent: villageclaq_relief_enrollment.
- `loan_overdue` remains fully plumbed but has NO caller (orphaned) — a
  future cron producer with a (loanId, day) bucket would light it up; do not
  enable live sends for it.
- Migration `00093` (four partial unique indexes: fineId, loanId, claimId
  per decision) is committed, NOT applied — apply it IN THE SAME RELEASE
  WINDOW as the deploy: the producers go live immediately and until the
  indexes exist their check-before-insert is racy. The migration is also
  late-apply-safe (it deletes any race duplicates, keeping the earliest row
  per key, before creating the unique indexes).
- Remaining holdbacks: remittances (template categories unverified — 2026-06
  batch), invitations, announcements (MARKETING-risk, category strategy
  pending), membership_status constraint widening + 00092,
  event/subscription/scheduled-announcement crons, proxy-claim route, and
  the loan_overdue cron above.
- No live messages were sent in the production of this addendum; all
  verification is static or mocked.

## Addendum 8 (2026-06-12, invitation + loan overdue producerization)

- **Invitation WhatsApp was dead code twice over**: the invitations dialog
  only collects emails (its phone/UUID regex never matched), and the direct
  send route's recipient guard 403s invitees (they are not members yet). The
  net effect: **phone-only invitations — onboarding step 7 and the branches
  founding-president flow — never received anything on any channel.** The
  old `villageclaq_invitation` template is additionally **MARKETING**
  (blocked to US numbers, error 131049) and its `{{1}}` was the inviter.
- New `member_invitation` type → UTILITY `villageclaq_member_invitation_notice`
  (`{{1}} inviteeName`, `{{2}} groupName`, `{{3}} invitationLink`) via
  `src/lib/member-invitation-producer.ts` and the authz'd route
  `/api/invitations/whatsapp-notifications` (inviter / active owner-admin /
  staff — tight by design, since this producer messages external phone
  numbers). The producer re-reads the invitation row: pending-only, expiry
  honored, phone from the row only. `{{1}}` is the claim-target membership's
  name for proxy-claim invitations and a localized fallback label otherwise
  (the invitee has no account — also why no notification preference applies,
  matching the always-send email leg, and why the locale is the inviter's UI
  locale). The link is the same `/login?redirectTo=/dashboard/my-invitations`
  destination as the email (rule 12), locale-prefixed.
- Invitation idempotency is a DAY BUCKET on (invitationId, sendDate):
  same-day double-clicks dedupe while the existing resend feature still
  re-delivers on a later day. Wired into the onboarding bulk insert and the
  branches flow (both now capture inserted ids); the email-only invite
  dialog needs no wiring — its dead WhatsApp block was removed.
- **`loan_overdue` was fully plumbed but orphaned** (template, builder, and
  dispatcher case existed; zero callers). New daily cron
  `/api/cron/loan-overdue-reminders` (10:00 UTC — staggered after the 08:00
  payment-reminders burst to keep the shared 50-row/15-min drain from
  head-of-line blocking) discovers candidate repaying loans and calls
  `src/lib/loan-overdue-producer.ts` per loan. Eligibility deliberately
  accepts `pending`/`partial`/`overdue` installments past due —
  **nothing server-side ever sets the `overdue` flag** (the client marks it
  lazily on page visits), the exact pitfall the payment-reminder producer
  documents. Only `repaying` loans are nagged (never completed/defaulted/
  written_off); the message quotes the EARLIEST overdue installment's
  outstanding amount and due date (the template body is singular). One
  reminder per loan per UTC day — (loanId, reminderDate) bucket. Proxy
  borrowers are included (money-path family precedent; WhatsApp is the only
  channel that reaches them). WhatsApp-only: no loan-overdue email/SMS
  exists, and the in-app notice stays with the client-side
  markOverdueInstallments path (unchanged).
- Migration `00094` (committed, NOT applied): both day-bucket unique
  indexes with the 00093-style late-apply dedupe preamble. Apply in the
  same release window as the deploy.
- Operational notes: the invitation route carries the same 50/hour
  per-caller rate limit as the direct send route — it is the only producer
  route whose recipients are non-members. The overdue cadence is daily
  while a loan stays overdue (payment-reminder precedent); note that PROXY
  borrowers cannot opt out (preferences require an account), so a
  long-overdue proxy loan nags daily until paid, defaulted, or archived —
  accepted for now, a cap/backoff is a candidate follow-up. Both reminder
  crons share PostgREST's ~1000-row response ceiling on candidate
  discovery (unordered truncation at extreme scale) — parity with
  payment-reminders, flagged for a follow-up RPC when volumes grow.
- **Ship-with caveat — phone-invitee acceptance gap**: my-invitations
  matches invitations by email/user_id only (and the invitations RLS
  SELECT policy is likewise email/inviter/user_id-based), so a phone-only
  invitee who taps the WhatsApp link and signs up cannot yet SEE their
  invitation — the notice delivers a CTA the app cannot complete. The
  matching + RLS fix should land in the same release window or immediately
  after; until it does, treat onboarding phone invitations as
  message-only. Branch-flow invitations are unaffected (they always carry
  an email). The pre-existing dead email gates (getEnabledChannels(null)
  on the members/onboarding/branches email legs always returns
  email:false) are likewise untouched and flagged.
- Remaining holdbacks: remittances (template categories unverified —
  2026-06 batch), announcements (MARKETING-risk, category strategy
  pending), membership_status constraint widening + 00092,
  event/subscription/scheduled-announcement crons, and the proxy-claim
  route.
- No live messages were sent in the production of this addendum; all
  verification is static or mocked.

## Addendum 9 (2026-06-12, phone-invitee matching fix)

- Resolves the **ship-with caveat from addendum 8**: phone-only invitees who
  tapped the WhatsApp invitation link landed on an empty my-invitations page.
  Root cause was triple-layered: (1) the page bailed without an auth email
  and matched email/user_id only; (2) the original phone RLS predicate
  (00001) subqueried auth.users — which policies cannot do — so 00015
  dropped it and the phone leg was never restored; (3) accept_invitation
  (00076) hard-rejected email-NULL invitations, and the invitee UPDATE
  policy was email-gated so decline silently no-opped too.
- Migration `00095` (committed, NOT applied) restores the phone leg safely:
  a SECURITY DEFINER `get_my_phone_digits()` helper (auth phone first,
  `profiles.phone` fallback — RLS-safe, following the get_user_group_ids
  pattern); an invitee **SELECT** policy for **email-NULL** phone rows on
  **exact normalized-digits** match; a shared `caller_matches_invitation()`
  gate; and `accept_invitation` re-emitted verbatim except the gate is
  widened through that helper. There is deliberately **no invitee phone
  UPDATE policy** — an RLS `WITH CHECK` cannot pin immutable columns against
  the OLD row, so a phone-matching UPDATE policy would let a caller repoint
  `group_id`/`role` and accept into an arbitrary group. Decline therefore
  goes through a new SECURITY DEFINER `decline_invitation()` RPC (flips
  status→declined, stamps user_id, touches nothing else). Trust trade-offs
  documented in the migration header: phone matching never applies when the
  invitation carries an email (email invitations stay verified-email-only);
  phone accept/decline are restricted to **member-role** invitations
  because `profiles.phone` is a self-asserted, freely-editable identity; and
  because there is no UPDATE path, acceptance is bounded to exactly the
  group the inviting admin targeted. No suffix matching — format divergence
  (local "0677…" invitation vs E.164 profile) yields false negatives only.
- The my-invitations query resolves the caller's phone, adds a phone
  or-leg, and applies a **mandatory** client-side digits post-filter (group
  members can otherwise see all of their group's invitations through the
  admin policy). Decline now calls `decline_invitation()`. The
  pending-invitation routing counters (dashboard layout + both auth
  callbacks, kept identical per rule 10) call a new invitee-scoped
  `count_my_pending_invitations()` RPC — counting only rows addressed to the
  caller (email / stamped user_id / member-role phone), NOT the inviter or
  group-member RLS legs, so a former inviter with 0 memberships is not
  misrouted to my-invitations. All three call sites fail soft to the
  email-scoped count if the RPC is not yet applied, so login never breaks.
- The accepted-invitation welcome producer chain is unchanged
  (`accept_invitation` return shape frozen; `requestWelcomeWhatsApp` fires
  exactly as before). PR #13's WhatsApp delivery path is untouched.
- No live messages were sent; no production data mutated; migration `00095`
  must be applied in the SQL Editor (code fails soft until then — phone
  invitees simply keep seeing no rows, exactly as today).

## Addendum 10 (2026-06-12, remittance decision producerization)

- Remittances are branch-to-HQ relief transfers; when HQ confirms or
  disputes one, the BRANCH group's owner/admins are notified. The old path
  was the familiar client-side fire-and-forget (`notifyBulkFromClient` from
  the remittances page): no dedup (an HQ admin double-click or two-admin
  race re-sent every channel; the status UPDATE had no `pending`
  precondition), provider IDs dropped, and the deciding HQ admin's locale
  used for every branch recipient. Both templates were previously listed as
  "missing Meta approval" — they are now **confirmed UTILITY, approved
  EN/FR in WhatsApp Manager (2026-06-12)**.
- New `src/lib/remittance-decision-producer.ts` — the producer family's
  first MULTI-RECIPIENT producer: one queue row per eligible branch
  owner/admin, each with the recipient's own `preferred_locale` and
  `relief_updates` preference. The decision, amount (`formatAmount` with
  the remittance's currency), and branch group name are read
  authoritatively from the DB; blank variables are impossible; pending
  remittances skip. Proxy admins remain EXCLUDED (`user_id` required) —
  parity with the old path's filter.
- Idempotency is per **(remittanceId, decision template, recipient)**
  (migration `00096`, committed NOT applied, with the late-apply dedupe
  preamble): reruns dedupe per admin, a genuine confirmed→disputed
  reversal still notifies once per decision. Apply in the same release
  window as the deploy.
- Route `/api/relief/remittance-notifications` authz: active owner/admin
  of the BRANCH group, active owner/admin of an HQ group in the same
  organization (mirroring the relief_remittances UPDATE RLS), or platform
  staff.
- The remittances page's status UPDATE now carries a `pending`
  precondition with a visible "already decided" bail-out (loans
  precedent), so a stale decision no longer re-fires in-app/email/SMS
  either; in-app/email/SMS otherwise stay on the legacy client path with
  payload fields preserved (the SMS template reads groupName/amount/
  status).
- Remaining holdbacks: announcements (MARKETING-risk, category strategy
  pending), membership_status constraint widening + 00092,
  event/subscription/scheduled-announcement crons, and the proxy-claim
  route. With remittances done, every member-facing money path is
  producer-backed.
- No live messages were sent in the production of this addendum; all
  verification is static or mocked.

## Addendum 11 (2026-06-12, legacy cron producerization: hosting, events, subscriptions; announcements deferred)

- This pass converts the remaining legacy direct-dispatch reminder crons to
  the queue-backed producer discipline. After it, the ONLY cron route that
  dispatches WhatsApp directly is `send-scheduled-announcements` (an
  explicit, audited allowlist — see the deferral note below) plus the queue
  drain itself.
- **Hosting reminders** (`/api/cron/hosting-reminders`) — this was an
  active production bug, found during the 2026-06-12 QA cleanup
  (`docs/qa-cleanup-2026-06-12.md`): the in-app insert used
  `type: "hosting_reminder"`, which is NOT in the `notification_type` enum,
  so it always failed; and the dedup compared the ISO `assigned_date`
  against a body containing a locale-formatted date via `.like("body", …)`,
  so it never matched — duplicate daily WhatsApp/email sends for every
  assignment inside the 7-day window. Replaced by
  `src/lib/hosting-reminder-producer.ts`: strict idempotency per
  **(assignmentId, assignedDate)** — one reminder per assignment
  occurrence, ever; a reschedule (new `assigned_date`) legitimately
  re-reminds. The cron's in-app/email/SMS now gate on a deterministic
  `dedup_key` (`hosting_reminder_<assignmentId>_<assignedDate>`) with a
  valid `type: "system"` in-app row; proxy SMS gates on the producer's
  first-enqueue result (proxies cannot carry a notifications dedup row —
  `notifications.user_id` is NOT NULL).
- **Event reminders** (`/api/cron/event-reminders`) — WhatsApp moved to
  multi-recipient `src/lib/event-reminder-producer.ts`, strict per
  **(eventId, userId)** (parity with `events.reminder_sent_at` = remind
  once per event). The `reminder_sent_at` flip is now race-gated with
  `.is("reminder_sent_at", null)`. Two latent legacy bugs fixed: WhatsApp
  recipients were derived from the EMAIL list (phone-but-no-email members
  never got WhatsApp), and location-less events passed an EMPTY `{{4}}`
  body param (Meta rejects blank params) — now a translated fallback
  (`cron.eventLocationFallback`, EN/FR).
- **Subscription-expiring reminders** (`/api/cron/subscription-reminders`)
  — WhatsApp moved to multi-recipient
  `src/lib/subscription-expiring-producer.ts`, day-bucket per
  **(subscriptionId, reminderDate, userId)**: the daily daysLeft-countdown
  cadence inside the 7-day window is intentional; same-day reruns are
  idempotent. The producer and route are strictly READ-ONLY on
  `group_subscriptions` (billing/Stripe state untouched, test-enforced).
  The existing windowed `dedup_key` mechanism for in-app/email/SMS is
  unchanged. NOTE: `villageclaq_subscription_expiring`'s Meta category is
  still UNVERIFIED (2026-06 submission batch — MARKETING risk per the
  131049 memory); producerization does not change that — verify category
  in WhatsApp Manager before any controlled QA to a US number.
- **Scheduled announcements — DEFERRED (Option B), deliberately.**
  `/api/cron/send-scheduled-announcements` keeps its current direct
  dispatch because announcements are strategy-sensitive, not just
  mechanics: `villageclaq_announcement_v2` is MARKETING-category, which
  Meta silently drops to US numbers (error 131049) — and VillageClaq's
  diaspora is largely US-based. Producerizing the dispatch now would bake
  today's template/category assumptions into queue rows and webhook
  correlation before the open product decision (UTILITY re-submission of
  announcement copy vs. accepting non-US-only delivery vs. channel
  fallback). Required decision, in order: (1) owner picks the announcement
  category strategy; (2) if a UTILITY replacement is approved, verify BOTH
  the category AND the WABA placement (131005 lesson) in WhatsApp Manager;
  (3) only then producerize the announcement path (multi-recipient,
  per (announcementId, userId) strict idempotency — design already proven
  by the event producer). Guardrails added NOW: the audit script pins an
  explicit direct-dispatch allowlist for cron routes, so any new direct
  `dispatchWhatsApp` use — or announcements silently growing one elsewhere
  — fails the audit.
- Migration `00097_legacy_cron_reminder_idempotency.sql` (committed, NOT
  applied): three partial unique indexes on `notifications_queue` (one per
  producer key above) with the 00096-style late-apply dedupe preamble, plus
  a unique backstop on `notifications (user_id, dedup_key)` for the hosting
  dedup keys. Deliberately NO unique index for the existing
  `subscription_expiring_%` dedup keys — those legitimately repeat across
  billing years; the cron's 24h-windowed check remains the right guard.
  Apply in the same release window as the deploy.
- No live messages were sent in the production of this addendum; all
  verification is static or mocked. No Meta template, category, WABA, or
  provider configuration was touched.

## Addendum 12 (2026-06-13, subscription-expiring Utility remap)

- The PR #16 release QA (2026-06-12) confirmed `villageclaq_subscription_expiring`
  is MARKETING-categorized: Meta accepted the send (wamid issued) and the
  webhook recorded **failed / 131049** to the US QA number. The owner
  submitted a UTILITY replacement, now approved EN + FR in WhatsApp Manager
  (Active - Quality pending): **`villageclaq_account_access_notice`**.
- Runtime remap: `WA_TEMPLATES.SUBSCRIPTION_EXPIRING` →
  `villageclaq_account_access_notice`. **Variable semantics changed with the
  template**: `{{1}}` is now the GROUP/ORGANIZATION name (the old template's
  `{{1}}` was the plan/tier name); `{{2}}` stays days left. Updated together:
  `buildSubscriptionExpiringParams` (`{ groupName, days }`), the dispatcher's
  `subscription_expiring` case (`d.groupName`), and the producer's
  `whatsappData` + blank guard (group name, already read for the
  `group_inactive` check; the unused `tier` read was dropped — billing reads
  stay minimal). Internal type key `subscription_expiring`, the queue
  idempotency keys, and migration 00097's index are all UNCHANGED — only the
  Meta-facing template name and `{{1}}` source changed.
- Drain compatibility: the drain resolves the template from `whatsappType`
  at send time, so the remap needs no queue surgery. At authoring time the
  queue held ZERO queued `subscription_expiring` rows (the lone QA row is
  terminal `sent`), so no row can dispatch with a stale `planName`-shaped
  payload. Old failed rows are never retried by design.
- Audit guardrails added: subscription-expiring must map to
  `villageclaq_account_access_notice` and may never reference the Marketing
  template again (templates registry + producer + dispatcher are all
  checked); a second check pins the `{{1}} groupName, {{2}} days` body
  order.
- Approved copy (recorded in `docs/WHATSAPP_TEMPLATES.md` #16) —
  EN: `Your VillageClaq access for {{1}} will end in {{2}} day(s). Review
  your account status in VillageClaq.` / FR: `Votre accès à VillageClaq
  ({{1}}) prendra fin dans {{2}} jour(s). Consultez le statut de votre
  compte dans VillageClaq.` The in-app/email/SMS copy in
  `messages/{en,fr}.json` is channel-local and intentionally unchanged.
- **Event reminders deliberately NOT remapped in this pass**:
  `villageclaq_event_reminder_v2` is also 131049-confirmed MARKETING, but a
  remap to the older `villageclaq_event_reminder` is NOT "clearly safe" —
  its current category, Active status, WABA placement, and exact body order
  cannot be verified from this environment (no WhatsApp Manager access; no
  Meta API credentials in the local env), and the v2 suffix exists because
  the body changed. Per the 131049/131005 lessons, any event-reminder remap
  needs Manager verification of category AND WABA AND variable order first.
- No live messages were sent in the production of this addendum; no Meta
  template, category, WABA, or provider configuration was touched; no
  migration is needed (queue keys and indexes unchanged).

## Addendum 13 (2026-06-13, event-reminder Utility remap)

- Addendum 12 deferred this remap because the original
  `villageclaq_event_reminder` could not be verified from this environment.
  That blocker is now cleared: the owner **manually verified it in WhatsApp
  Manager on 2026-06-13** — EN Utility (Active - Quality pending), FR
  Utility, and the variable order is correct in BOTH languages:
  `{{1}}` memberName, `{{2}}` eventTitle, `{{3}}` eventDate,
  `{{4}}` eventLocation (the location, NOT the event time),
  `{{5}}` groupName.
- Runtime remap: `WA_TEMPLATES.EVENT_REMINDER` →
  `villageclaq_event_reminder` (from the MARKETING-categorized
  `villageclaq_event_reminder_v2`, which Meta blocks to US numbers — error
  131049, confirmed live in the PR #16 release QA on 2026-06-12). Because
  the verified body order is IDENTICAL to v2, this is a **pure name
  remap**: `buildEventReminderParams`, the dispatcher's `event_reminder`
  case, the producer payload, the queue idempotency keys
  (per eventId + userId), and migration 00097's index are all unchanged.
- Drain compatibility: the drain resolves templates from `whatsappType` at
  send time; the only `event_reminder` queue row (the PR #16 QA row) is
  terminal `sent`, so nothing can dispatch with a stale name. Old failed
  rows are never retried.
- Audit guardrails added: event reminders must map to
  `villageclaq_event_reminder` and may never reference the Marketing v2
  again (templates registry + producer + dispatcher all checked); a second
  check pins the verified 5-variable body order; the
  `approvedLaunchTemplateNames` pin was updated to the verified name.
- Docs: `WHATSAPP_TEMPLATES.md` #3 marked SUPERSEDED FOR RUNTIME USE
  (its recorded UTILITY category was wrong — Meta categorized v2 as
  MARKETING), new #3b records the verified runtime target.
- With this remap, the confirmed-Marketing set still awaiting a category
  decision shrinks to: `villageclaq_announcement_v2` (announcements
  strategy — Addendum 11 Option B) and the retired-from-runtime templates
  (`villageclaq_welcome`, `villageclaq_invitation`,
  `villageclaq_subscription_expiring`, `villageclaq_event_reminder_v2`);
  `villageclaq_proxy_claim`'s category remains unverified.
- No live messages were sent in the production of this addendum; no Meta
  template, category, WABA, or provider configuration was touched; no
  migration is needed.

## Addendum 14 (2026-06-13, scheduled-announcements category strategy + guardrails)

- With PR #17 (subscription expiring → `villageclaq_account_access_notice`)
  and PR #18 (event reminders → `villageclaq_event_reminder`) released and
  QA-delivered to the US controlled recipient, the LAST Marketing-risk
  runtime path is announcements. This pass documents the strategy and makes
  the deferral self-enforcing — **no runtime behavior changed**.
- Path audit (full detail in `docs/announcements-whatsapp-strategy.md`):
  announcements direct-dispatch from exactly two places — the manual
  composer (client `notifyBulkFromClient` → `/api/whatsapp/send` per
  recipient; WhatsApp is opt-in, channel defaults are in-app only; no
  dedupe) and the every-5-min scheduled cron (`dispatchWhatsApp` per
  recipient; row-level `sent_at` idempotency only, no per-recipient keys;
  allowlisted direct dispatch). There is NO queue-backed announcement path.
  Both use `villageclaq_announcement_v2` (MARKETING) and can reach US
  recipients, where delivery silently fails with 131049.
- Strategy (binding, audit-enforced): generic/promotional announcements
  stay off WhatsApp for US recipients (in-app/email instead); the
  `ANNOUNCEMENT` constant is pinned to the Marketing template and may not
  be remapped to any Utility template without an approved class-1
  operational use case; specific operational notice types get their OWN
  Manager-verified Utility templates (PR #17/#18 procedure) if ever needed.
- New audit guardrails: strategy-doc binding markers; `ANNOUNCEMENT`
  mapping + MARKETING-risk annotation pinned; `WHATSAPP_TEMPLATES.md` #8
  must stay flagged not-US-safe; every announcement-named template constant
  must be classified in the strategy doc (new-template guard); the
  scheduled cron must remain allowlisted direct-dispatch OR become
  producer-backed with per-recipient idempotency — never silently neither.
- A low-risk runtime guard (skip announcement WhatsApp to +1 recipients
  while the template is Marketing) was considered and deliberately NOT
  implemented — it touches the shared dispatch path used by every send.
  Documented as a proposed follow-up in the strategy doc.
- No live messages were sent in the production of this addendum; no
  production data was touched; no Meta template, category, WABA, or
  provider configuration was changed; no migration is needed.
