# Founder executor acceptance — 2026-09-27

## Exact state

- Branch: `codex/qualification-repair-247c8881`
- Starting application: `2213aadaa127c570730af264ec16057f81db5fd6`
- Starting evidence: `da8ae6a98f483a891795391b04689e171b1a7f12`
- Tested application repair: `ab11898a54add2798e0c7be5e18bac3b72cd4f03`
- Isolated Supabase branch: `nisipxbuvndobyxqqglf`
- Hosted repair migrations: `20260927210445 active_contribution_obligations` and `20260927210932 notification_delivery_status_enum`, following repository migration `00203`
- Unaliased Vercel Preview: `dpl_8ciNx2fpWqq418v3nmuvT1p63kM3`, `https://villageclaq-l56umkjx8-gatekipas.vercel.app`
- Public `villageclaq.com` deployment was not changed.

The preview status endpoint returned `founderTestMode=true`, `bindingMatches=true`, `serviceCredentialVerified=true`, `externalDeliverySuppressed=true`, and `scheduledSideEffectsSuppressed=true`. Browser login with a fictional member reached the isolated group dashboard. The deployed Announcements route rendered its empty state after the repair. Founder credentials remain only in ignored local access files; temporary admin/member test passwords were restored to their recorded founder-access values.

## FQ-03 — contribution create and obligation behavior

The existing `QA Test Contribution` and its two active fictional obligations were preserved. In the browser, an administrator created one distinctly named `Founder Acceptance Contribution 2026-09-27` for 2,750 XAF.

- The success state was visible.
- The new contribution appeared in the list immediately without a refresh.
- A browser reload preserved it.
- Its report and an authoritative database read showed exactly two obligations, both for active memberships, each for 2,750 XAF and due 2026-09-27.
- The initial run exposed two additional obligations for archived proxy artifacts. Migration `00204_active_contribution_obligations.sql` restricts enrollment to active, non-banned memberships. Only those two newly created invalid fictional obligations were removed; retained history and the older QA contribution were unchanged.
- A rollback probe on another fictional group confirmed two active obligations and zero inactive obligations. `anon` and `authenticated` cannot execute the trigger function directly.
- A browser failure probe using a zero amount displayed `Amount must be greater than 0`; no contribution or obligation was created under the rejected probe name.

Disposition: **FQ-03 CLOSED in tested scope**. FA-03 remains pending for the unexecuted loans, savings-circle, fines, and full report journeys.

## FA-02 — invitations, joining, independent memberships, revocation

- An administrator created one invitation for the existing fictional member. Repeating the same recipient in the browser displayed `This person already has an active invitation or accepted invite for this group.` The database retained one invitation row.
- The client now handles both the server's `is_existing` replay result and structured `23505` errors without queueing another notice or audit entry. The bulk-invite path uses the same behavior.
- The existing-account invitation link redirected through login to My Invitations. Accepting it displayed `Invitation accepted`.
- The member group switcher then showed three independent active memberships with distinct roles: member, owner, and member.
- A second fictional invitation was revoked through the authenticated administrator RLS path. Browser reload displayed `Revoked`; the invited user saw one revoked invitation, zero pending invitations, and no Accept action.
- The invited user opened the real join-code route. The first authenticated command created one membership and one `member.joined` audit; replay returned `already_member`. The browser then displayed `You're already a member!`.
- `npm run test:invitation-integrity` passed 9/9.

Disposition: **FA-02 PASS for the frozen acceptance slice**.

## FA-08 communications assertion

The red raw-provider assertion exposed a current defect. The queue worker fabricated provider IDs and marked email, SMS, and WhatsApp rows successful without calling an approved provider adapter. It was not an obsolete expectation.

The worker now calls the approved channel adapter, requires a real provider message ID before success, and preserves the raw Meta drain boundary. Email and SMS adapters propagate provider IDs. Founder mode fails closed before external delivery. The first isolated failure probe also exposed a database enum mismatch in `settle_notification_delivery`; migration `00205_notification_delivery_status_enum.sql` fixes that function and keeps EXECUTE service-role-only.

Final isolated probe for one fictional email reminder: processed 1, succeeded 0, failed 1, attempts 2, provider message ID null, sent timestamp null, error `founder_test_external_delivery_suppressed`. No external message was sent.

Focused results:

- `npm run test:s0-cut2-raw-meta-drain-only`: 1/1 PASS
- `npm run test:s0-cut2-email-drain-only`: 3/3 PASS
- `npm run test:s0-cut2-no-extra-provider-send`: 1/1 PASS
- `npm run test:s0-cut2-sms-sender-no-queue-insert`: 1/1 PASS
- The aggregate `npm run test:s0-cut2` was interrupted after it stopped producing progress; it is not recorded as a pass.

## Other frozen FA cases

- **FA-01:** dashboard, authoritative group scope, My Groups, and independent group switching rendered for the fictional member. Existing two-tab and delayed-response evidence remains reusable; unexecuted representative module states remain **PENDING**.
- **FA-03:** FQ-03 is closed as above. The broader financial module journeys remain **PENDING**.
- **FA-04:** member Events rendered an honest no-events state and Meetings rendered the published-minutes view with no results. Prior revocation and attendance evidence remains reusable. Remaining create/participate/publish, attendance, hosting, EN/FR, and mobile cases are **PENDING**.
- **FA-05:** Elections rendered, Hierarchy rendered the honest no-organization-scope state for the selected group, and member Relief rendered no plans/claims. Existing governance/election/Relief evidence remains reusable. Remaining finite lifecycle cases are **PENDING**; only historical R-012 activation is **BLOCKED** on finance-owner reconciliation.
- **FA-06:** Constitution and Document Vault rendered honest empty states. Announcements reproduced `Cannot access 'setTitleEn' before initialization`; moving group-change cleanup into an effect repaired the browser route, which now renders `No announcements yet` locally and on the deployed preview. Projects and the remaining governance lifecycle are **PENDING**. Only attachment operations are **BLOCKED** on the Storage-owner action.
- **FA-07:** Badges rendered `No badges yet`; the digital membership card rendered the fictional member. Referrals, public-profile publication/revocation, remaining direct links, and full EN/FR/mobile cases are **PENDING**.
- **FA-08:** Feedback and Help Center rendered their empty states; the communications worker repair passes as above. React reported nested Feedback dialog-trigger buttons during the route check, with no observed failure; it is recorded once in the shared advisory backlog. The broader activity role matrix and settings cases not covered by earlier valid evidence remain **PENDING**.

## Verification

- `npx tsc -p tsconfig.json --noEmit`: PASS
- Focused ESLint on all changed TypeScript paths: zero errors; three pre-existing Announcements warnings remain advisory.
- `git diff --check`: PASS
- Vercel optimized build and TypeScript: PASS; deployment READY.
- Browser: FQ-03 creation/failure/refresh, FA-02 duplicate/link/code/revocation/multi-group, repaired Announcements, and representative frozen route states were observed against the isolated backend.

## Remaining dependencies and ownership

- **Supabase Storage owner/provider:** on `nisipxbuvndobyxqqglf`, install the four production-equivalent `gdocs_select_group`, `gdocs_insert_group`, `gdocs_update_group`, and `gdocs_delete_group` policies using `storage_group_documents_authorized(name, operation)`. Revoke `TRUNCATE` on `storage.objects`, `storage.buckets`, and `storage.buckets_analytics` from `PUBLIC`, `anon`, and `authenticated`, then return policy definitions and effective grants. Daybreak Blue then runs the prepared real Storage API matrix. Production Storage remains outside authorization.
- **Finance owner/Jude:** reconcile the four quarantined historical R-012 remittances. No duplicate, settled-cash, or opening-balance inference was made; no accounting entry was invented.
- **Daybreak Blue:** continue only tracker-listed PENDING acceptance cases. The actual GPT-6 Sol bounded review verdict remains preserved for its reviewed scope and was not restarted.
- **Jude:** use the protected preview for the short product-judgment session when ready. Promotion to `villageclaq.com` still requires explicit authorization.

The candidate is **ready for founder preview testing** for the completed slices. Whole-product/client release remains **HOLD** because Storage API acceptance, R-012 reconciliation, and the tracker-listed PENDING cases remain open.
