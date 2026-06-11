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
| `invitation` | `INVITATION` | `villageclaq_invitation` | MARKETING | yes | yes | `inviterName`, `groupName`, `acceptUrl` | 3 | generic dispatcher support | direct/client if invoked | no durable queue correlation unless queued | Ready for template QA only after producer path is confirmed |
| `loan_approved` | `LOAN_APPROVED` | `villageclaq_loan_approved` | UTILITY | yes | yes | `memberName`, `amount`, `groupName` | 3 | `src/lib/loan-approved-producer.ts` via `/api/loans/approval-notifications` (see addendum 7) | queue-backed (`notifications_queue`) | provider ID + webhook status correlated via queue row | Apply migration 00093 before QA |
| `loan_overdue` | `LOAN_OVERDUE` | `villageclaq_loan_overdue` | UTILITY | yes | yes | `memberName`, `amount`, `dueDate`, `groupName` | 4 | generic dispatcher support | direct/client if invoked | no durable queue correlation unless queued | Ready for template QA only after producer path is confirmed |
| `fine_issued` | `FINE_ISSUED` | `villageclaq_fine_issued` | UTILITY | yes | yes | `memberName`, `fineType`, `amount`, `reason`, `groupName` | 5 | `src/lib/fine-issued-producer.ts` via `/api/fines/issued-notifications` (see addendum 7) | queue-backed (`notifications_queue`) | provider ID + webhook status correlated via queue row | Apply migration 00093; VERIFY {{4}}/{{5}} ORDER in WhatsApp Manager before live QA (addendum 7) |
| `standing_changed` | `STANDING_CHANGED` | `villageclaq_standing_changed` | UTILITY | yes | yes | `memberName`, `newStanding`, `groupName` | 3 | `src/lib/standing-change-producer.ts` via `/api/members/standing-notifications` (see addendum 6) | queue-backed (`notifications_queue`) | provider ID + webhook status correlated via queue row | Apply migration 00091 before QA |
| `welcome` | `WELCOME` | `villageclaq_member_joined` (was `villageclaq_welcome`, see addendum 2) | UTILITY | yes | yes | `memberName`, `groupName` | 2 | `src/lib/welcome-producer.ts` via `/api/members/welcome-notifications` | queue-backed (`notifications_queue`) | provider ID + webhook status correlated via queue row | Default `new_member` prefs keep WhatsApp off; enable for QA |
| `hosting_assignment` | `HOSTING_ASSIGNMENT` | `villageclaq_hosting_reminder` (reused; see addendum 3) | UTILITY | yes | yes | `memberName`, `hostingDate`, `groupName` | 3 | `src/lib/hosting-assignment-producer.ts` via `/api/hosting/assignment-notifications` | queue-backed (`notifications_queue`) | provider ID + webhook status correlated via queue row | Apply migration 00089 before QA |
| `relief_enrollment` | `RELIEF_ENROLLMENT` | `villageclaq_plan_enrollment_confirmed` (was `villageclaq_relief_enrollment`, see addendum 5) | UTILITY | yes | yes | `memberName`, `planName`, `groupName` | 3 | `src/lib/relief-enrollment-producer.ts` via `/api/relief/enrollment-notifications` | queue-backed (`notifications_queue`) | provider ID + webhook status correlated via queue row | Migration 00089 applied; ready for QA re-run |
| `remittance_confirmed` | `REMITTANCE_CONFIRMED` | `villageclaq_remittance_confirmed` | missing | no | no | `amount`, `groupName` | missing | relief remittances page via `notifyFromClient` | client route `/api/whatsapp/send` | no durable queue correlation unless queued | Hold: missing Meta approval |
| `remittance_disputed` | `REMITTANCE_DISPUTED` | `villageclaq_remittance_disputed` | missing | no | no | `amount`, `groupName` | missing | relief remittances page via `notifyFromClient` | client route `/api/whatsapp/send` | no durable queue correlation unless queued | Hold: missing Meta approval |
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
- **Fine template QA gate**: `docs/WHATSAPP_TEMPLATES.md` documents
  `villageclaq_fine_issued` parameters as 1=member_name, 2=fine_type,
  3=amount, **4=group_name, 5=reason**, but `buildFineIssuedParams` emits
  **{{4}}=reason, {{5}}=groupName**. One of the two is wrong; there is no
  delivery evidence either way (the old path was never live-QA'd). The
  builder was deliberately left unchanged (code parity). Before live fine
  QA, check the approved body in WhatsApp Manager: if it reads
  "({{4}}). Reason: {{5}}" with 4=group, fix `buildFineIssuedParams`'
  order first, else fix the doc.
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
