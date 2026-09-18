# PROPOSED HOSTED REQUALIFICATION PLAN — PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE

**Status:** PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE
**Label:** F18 LOCAL CORRECTION CANDIDATE — AWAITING QA / LOCAL TX PROOF
**This document does not authorize wipe, hosted reset, credential use, Daybreak/Astra contact, or Management API apply.**

## Bound identities

- Functional tip SHA: `ca2c0d536037da8c7f55627ac1694cacb932d1d7`
- Runtime closure label: `F18_QUALIFICATION_RESET_RUNTIME_CLOSURE`
- Runtime closure SHA-256: `c6ecf620e41dbbce340e2207b2b9b793c8df750c703d245363139b497526a392` (count 45)
- Verification-union label: `F18_QUALIFICATION_RESET_VERIFICATION_UNION`
- Verification-union SHA-256: `b9a9e6b7ad95f6e5935d05bb6c41bdabe543f0f88a086bc6b28fcb07dd03be78` (count 48)
- Runtime and union identities are distinct and must not be collapsed
- F14 runtime baseline (cited, not expected): `f6205869b233eaccf375b299112f7b9c352d58c6f2659471e06d2ca7a241e31d`
- F14 union baseline (cited, not expected): `f6ff6e42b4b5ec14b1a67fe88377d7deafe5f12f2c2c35c834e7c763711e7caa`
- F16 runtime baseline (cited, not expected): `1ca2a1ceddca278889c7ea92fc10e6a59150e06c5b4f13d4426b293fda29ee78`
- F17 runtime baseline (cited, not expected): `0db1c600c620c0e406038fa3ebc5c4d7df6104bce64545ef9e16a63a6237c741`
- F17 union baseline (cited, not expected): `d3fd2eb52a2adc2a1f963a54955b888b2d3e8eadea0283894c4a51f5effc41cb`
- Scope/SQL identity SHA-256: `8b91a29cd3178e40d2ef5d79b6c585c1f7e2e615bd3967935546b68f2f9f8a0e`
- CLI pin: `2.117.0`
- Proof helper: `scripts/prove-f3-qualification-reset-local.mjs`
- Apply argv: `-X -q -t -A -w -v ON_ERROR_STOP=1 -f [FILE]`

## Target

- Accept disposable only: `jkorwnwwmdeflfntxntl` (jkorwnwwmdeflfntxntl)
- Reject production: `llbnliixczcqfftxpsmb` (llbnliixczcqfftxpsmb)
- Reject: `llbnliixczcqfftxpsmb`, `transaction pooler :6543`

## Secure placeholders

- Database URL: `[REDACTED]`
- Password: `[REDACTED]`
- Founder authorization artifact must not contain connection material

## Wipe / budget / CLEAN_BASELINE

- Wipe remains `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`
- alreadyClean CLEAN_BASELINE is a no-op and does not consume the reset budget
- Consumed reset only after a confirmed committed mutation
- Budget: constrainedResets=1, completeQualsFrom00118=1, secondReset=false

## Exact reset command

```bash
node scripts/qualify-f3-db-push-disposable.mjs --qualification-reset --founder-authorization-artifact=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F18_QUALIFICATION_RESET_HOSTED_REQUAL/hosted/qualification-reset/FOUNDER_AUTH.json --evidence-out=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F18_QUALIFICATION_RESET_HOSTED_REQUAL/hosted/qualification-reset/qualify-result.json
```

## Exact qualify-from-00118 command

```bash
node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3 --floor-mode=stub-live-pin --evidence-out=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F18_QUALIFICATION_RESET_HOSTED_REQUAL/hosted/qualify-from-00118/qualify-result.json
```

## CLI / Management API

- CLI 2.117.0 apply and repair remain separate commands; Management API apply is never authorized
- applyRepairSeparation=true
- Management API apply authorized: false

## Object / dependency / history scope

- Object count: 113
- Dependency count: 37
- History key count: 6
- Dependency count change vs F14 aggregates: aggregates were not catalog identities; complete migration-created FK tuples among allowlisted objects are listed instead. Object allowlist unchanged.

### Objects

- `function` `public.post_financial_opening_cash(jsonb)` dropOrder=10
- `function` `public.get_financial_cashbook(uuid,timestamp with time zone,timestamp with time zone,uuid,text,integer,integer)` dropOrder=20
- `function` `public.get_financial_projection_bundle(uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone)` dropOrder=30
- `function` `public.post_financial_command(jsonb)` dropOrder=40
- `function` `public.correct_financial_event(jsonb)` dropOrder=50
- `function` `public.enqueue_outbound_notification(text,uuid,notification_channel,uuid,text)` dropOrder=60
- `function` `public.execute_member_transfer(jsonb)` dropOrder=70
- `function` `public.request_member_transfer(jsonb)` dropOrder=80
- `function` `public.has_group_permission(uuid,text,uuid)` dropOrder=90
- `function` `public.compute_member_standing(uuid)` dropOrder=100
- `function` `public.m2_is_valid_iana_timezone(text)` dropOrder=110
- `function` `public.notification_policy_set_updated_at()` dropOrder=120
- `function` `public.uuid_generate_v5(uuid,text)` dropOrder=130
- `function` `financial_core.post_f3_opening_cash(jsonb)` dropOrder=200
- `function` `financial_core.f3_opening_safe_text(text,integer,boolean)` dropOrder=210
- `function` `financial_core.guard_f3_opening_provenance()` dropOrder=220
- `function` `financial_core.correct_f3_command(jsonb)` dropOrder=230
- `function` `financial_core.check_f3_correction_closure()` dropOrder=240
- `function` `financial_core.guard_f3_correction_lineage()` dropOrder=250
- `function` `financial_core.assert_f3_correction_postings(uuid,jsonb)` dropOrder=260
- `function` `financial_core.resolve_f3_correction_replacement(jsonb,jsonb,boolean)` dropOrder=270
- `function` `financial_core.f3_correction_posting_json(uuid,uuid,uuid,uuid,text,timestamp with time zone,numeric,financial_control_class,uuid,uuid,uuid,financial_category_class,uuid,uuid)` dropOrder=280
- `function` `financial_core.f3_correction_child_id(uuid,uuid,text)` dropOrder=290
- `function` `financial_core.f3_correction_reason(jsonb)` dropOrder=300
- `function` `financial_core.f3_correction_signed_amount(numeric,text)` dropOrder=310
- `function` `financial_core.f3_correction_timestamp(timestamp with time zone)` dropOrder=320
- `function` `financial_core.f3_correction_fingerprint(jsonb)` dropOrder=330
- `function` `financial_core.f3_correction_canonical(jsonb)` dropOrder=340
- `function` `financial_core.guard_f3_correction_payload()` dropOrder=350
- `function` `financial_core.projection_cashbook_rows(uuid,boolean)` dropOrder=360
- `function` `financial_core.format_projection_amount(numeric,text)` dropOrder=370
- `function` `financial_core.post_f3_command(jsonb,jsonb)` dropOrder=380
- `function` `financial_core.lock_f3_identity(uuid,uuid,text,text,text)` dropOrder=390
- `function` `financial_core.check_f3_posting_closure()` dropOrder=400
- `function` `financial_core.guard_f3_posting_closure()` dropOrder=410
- `function` `financial_core.guard_f3_payload()` dropOrder=420
- `function` `financial_core.f3_fingerprint(jsonb)` dropOrder=430
- `function` `financial_core.f3_canonical(jsonb)` dropOrder=440
- `function` `financial_core.f3_trim(text)` dropOrder=450
- `function` `financial_core.f3_timestamp(jsonb)` dropOrder=460
- `function` `financial_core.f3_amount(jsonb,text)` dropOrder=470
- `function` `financial_core.f3_currency(jsonb)` dropOrder=480
- `function` `financial_core.f3_uuid(jsonb,boolean)` dropOrder=490
- `function` `financial_core.lock_financial_occurrence(uuid,text,text,text,uuid)` dropOrder=500
- `function` `financial_core.assert_finances_manage(uuid)` dropOrder=510
- `function` `financial_core.can_view_finances(uuid)` dropOrder=520
- `function` `financial_core.can_manage_finances(uuid)` dropOrder=530
- `function` `financial_core.check_event_balance_from_posting()` dropOrder=540
- `function` `financial_core.check_event_balance_from_event()` dropOrder=550
- `function` `financial_core.assert_financial_event_balanced(uuid)` dropOrder=560
- `function` `financial_core.guard_financial_posting_history()` dropOrder=570
- `function` `financial_core.guard_financial_event_history()` dropOrder=580
- `function` `financial_core.guard_financial_event_epoch()` dropOrder=590
- `function` `financial_core.guard_financial_category()` dropOrder=600
- `function` `financial_core.guard_financial_fund()` dropOrder=610
- `function` `financial_core.guard_financial_account()` dropOrder=620
- `function` `financial_core.currency_scale(text)` dropOrder=630
- `function` `financial_private.guard_ledger_epoch()` dropOrder=640
- `table` `financial_core.opening_provenances` dropOrder=700
- `table` `financial_core.correction_command_payloads` dropOrder=710
- `table` `financial_core.posting_command_payloads` dropOrder=720
- `table` `public.financial_postings` dropOrder=730
- `table` `public.financial_events` dropOrder=740
- `table` `public.financial_categories` dropOrder=750
- `table` `public.financial_funds` dropOrder=760
- `table` `public.financial_accounts` dropOrder=770
- `table` `public.financial_ledger_epochs` dropOrder=780
- `table` `financial_private.internal_financial_tenants` dropOrder=790
- `table` `financial_private.epoch_transitions` dropOrder=800
- `table` `public.notification_policy_triggers` dropOrder=900
- `table` `public.notification_policy_occurrences` dropOrder=910
- `table` `public.notification_policies` dropOrder=920
- `table` `public.position_assignments` dropOrder=930
- `table` `public.position_permissions` dropOrder=940
- `table` `public.group_positions` dropOrder=950
- `table` `public.hosting_swap_requests` dropOrder=960
- `table` `public.hosting_assignments` dropOrder=970
- `table` `public.hosting_rosters` dropOrder=980
- `table` `public.payment_obligation_applications` dropOrder=990
- `table` `public.payments` dropOrder=1000
- `table` `public.contribution_obligations` dropOrder=1010
- `table` `public.relief_remittances` dropOrder=1020
- `table` `public.relief_claims` dropOrder=1030
- `table` `public.relief_enrollments` dropOrder=1040
- `table` `public.relief_plans` dropOrder=1050
- `table` `public.fines` dropOrder=1060
- `table` `public.member_transfers` dropOrder=1070
- `table` `public.invitations` dropOrder=1080
- `table` `public.elections` dropOrder=1090
- `table` `public.events` dropOrder=1100
- `table` `public.meeting_minutes` dropOrder=1110
- `table` `public.announcements` dropOrder=1120
- `table` `public.notifications_queue` dropOrder=1130
- `table` `public.loans` dropOrder=1140
- `table` `public.projects` dropOrder=1150
- `table` `public.group_subscriptions` dropOrder=1160
- `table` `public.memberships` dropOrder=1170
- `table` `public.groups` dropOrder=1180
- `table` `public.profiles` dropOrder=1190
- `table` `public.organizations` dropOrder=1200
- `table` `public.__f3_acl_platform_canary_20260915` dropOrder=1210
- `sequence` `public.__f3_acl_platform_canary_20260915_id_seq` dropOrder=1220
- `type` `public.financial_account_kind` dropOrder=1300
- `type` `public.financial_account_status` dropOrder=1310
- `type` `public.financial_category_class` dropOrder=1320
- `type` `public.financial_config_status` dropOrder=1330
- `type` `public.financial_control_class` dropOrder=1340
- `type` `public.financial_event_class` dropOrder=1350
- `type` `public.financial_event_status` dropOrder=1360
- `type` `public.notification_channel` dropOrder=1370
- `schema` `financial_core` dropOrder=1400
- `schema` `financial_private` dropOrder=1410
- `extension` `btree_gist` dropOrder=1500

### Dependencies (complete kind/identity/from/to)

- `foreign_key` `memberships_group_id_fkey` from `public.memberships` to `public.groups`
- `foreign_key` `projects_group_id_fkey` from `public.projects` to `public.groups`
- `foreign_key` `notification_policies_group_id_fkey` from `public.notification_policies` to `public.groups`
- `foreign_key` `notification_policy_occurrences_group_id_fkey` from `public.notification_policy_occurrences` to `public.groups`
- `foreign_key` `position_assignments_membership_id_fkey` from `public.position_assignments` to `public.memberships`
- `foreign_key` `notification_policy_triggers_policy_id_fkey` from `public.notification_policy_triggers` to `public.notification_policies`
- `foreign_key` `financial_ledger_epochs_group_id_fkey` from `public.financial_ledger_epochs` to `public.groups`
- `foreign_key` `financial_ledger_epochs_created_by_fkey` from `public.financial_ledger_epochs` to `public.profiles`
- `foreign_key` `financial_ledger_epochs_approved_by_fkey` from `public.financial_ledger_epochs` to `public.profiles`
- `foreign_key` `internal_financial_tenants_organization_id_fkey` from `financial_private.internal_financial_tenants` to `public.organizations`
- `foreign_key` `internal_financial_tenants_created_by_fkey` from `financial_private.internal_financial_tenants` to `public.profiles`
- `foreign_key` `financial_accounts_group_id_fkey` from `public.financial_accounts` to `public.groups`
- `foreign_key` `financial_accounts_created_by_fkey` from `public.financial_accounts` to `public.profiles`
- `foreign_key` `financial_accounts_epoch_scope` from `public.financial_accounts` to `public.financial_ledger_epochs`
- `foreign_key` `financial_funds_group_id_fkey` from `public.financial_funds` to `public.groups`
- `foreign_key` `financial_funds_created_by_fkey` from `public.financial_funds` to `public.profiles`
- `foreign_key` `financial_categories_group_id_fkey` from `public.financial_categories` to `public.groups`
- `foreign_key` `financial_categories_created_by_fkey` from `public.financial_categories` to `public.profiles`
- `foreign_key` `financial_events_group_id_fkey` from `public.financial_events` to `public.groups`
- `foreign_key` `financial_events_created_by_fkey` from `public.financial_events` to `public.profiles`
- `foreign_key` `financial_events_epoch_scope` from `public.financial_events` to `public.financial_ledger_epochs`
- `foreign_key` `financial_events_reversal_scope` from `public.financial_events` to `public.financial_events`
- `foreign_key` `financial_events_replacement_scope` from `public.financial_events` to `public.financial_events`
- `foreign_key` `financial_postings_event_scope` from `public.financial_postings` to `public.financial_events`
- `foreign_key` `financial_postings_account_scope` from `public.financial_postings` to `public.financial_accounts`
- `foreign_key` `financial_postings_fund_scope` from `public.financial_postings` to `public.financial_funds`
- `foreign_key` `financial_postings_category_scope` from `public.financial_postings` to `public.financial_categories`
- `foreign_key` `financial_postings_member_scope` from `public.financial_postings` to `public.memberships`
- `foreign_key` `financial_postings_project_scope` from `public.financial_postings` to `public.projects`
- `foreign_key` `posting_command_payloads_event_id_fkey` from `financial_core.posting_command_payloads` to `public.financial_events`
- `foreign_key` `correction_command_payloads_group_id_fkey` from `financial_core.correction_command_payloads` to `public.groups`
- `foreign_key` `correction_command_payloads_correction_actor_fkey` from `financial_core.correction_command_payloads` to `public.profiles`
- `foreign_key` `correction_command_payloads_target_event_id_group_id_fkey` from `financial_core.correction_command_payloads` to `public.financial_events`
- `foreign_key` `correction_command_payloads_reversal_event_id_group_id_fkey` from `financial_core.correction_command_payloads` to `public.financial_events`
- `foreign_key` `correction_command_payloads_replacement_event_id_group_id_fkey` from `financial_core.correction_command_payloads` to `public.financial_events`
- `foreign_key` `opening_provenances_group_id_fkey` from `financial_core.opening_provenances` to `public.groups`
- `foreign_key` `opening_provenances_recorded_by_fkey` from `financial_core.opening_provenances` to `public.profiles`

### History keys

- `20260913173000` / `f3_bounded_financial_epoch_foundation` ← `00118_f3_bounded_financial_epoch_foundation.sql`
- `20260913173001` / `f3_01_core_ledger_foundation` ← `00119_f3_01_core_ledger_foundation.sql`
- `20260913173002` / `f3_02_secure_posting_idempotency` ← `00120_f3_02_secure_posting_idempotency.sql`
- `20260913173003` / `f3_03_projection_read_proof` ← `00121_f3_03_projection_read_proof.sql`
- `20260913173004` / `f3_04_correction_reversal` ← `00122_f3_04_correction_reversal.sql`
- `20260913173005` / `f3_05_opening_cash_command` ← `00123_f3_05_opening_cash_command.sql`

## Preconditions

- HEAD equals bound functionalTip
- founder authorization artifact binds target+functionalTip+runtimeClosure+scopeSqlIdentity+budget
- inventory capture uses QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL with machine-readable psql argv
- CLEAN_BASELINE alreadyClean is a no-op and does not consume the reset budget
- RESET_ELIGIBLE leftovers require eligible===true before one gated apply

## Expected deliberate failures from the actual runner

- `node scripts/qualify-f3-db-push-disposable.mjs --wipe-to-baseline` → `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`
- `node scripts/qualify-f3-db-push-disposable.mjs --qualification-reset` → `F13_FLAG_NOT_AUTHORIZATION`
- `node scripts/qualify-f3-db-push-disposable.mjs --qualification-reset --prep-floor --founder-authorization-artifact=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F18_QUALIFICATION_RESET_HOSTED_REQUAL/hosted/qualification-reset/FOUNDER_AUTH.json` → `F13_INVALID_FLAG_COMBINATION`

## Sequencing / evidence finalization

1. offline validate this plan with disabled hosted transports
2. confirm disposable target only; refuse production immediately
3. run exactly one constrained --qualification-reset if leftovers are eligible, or record alreadyClean no-op
4. if reset commits, consume constrainedResets=1; do not run a second reset
5. if alreadyClean, constrainedResets remains unused; still run exactly one complete qual-from-00118
6. run exactly one complete qualify-from-00118: --no-wipe --prep-floor --sequence-f3 --floor-mode=stub-live-pin
7. stop on first unexpected failure; UNCERTAIN_COMMIT forbids replay
8. finalize evidence bytes, then Chief/QA review; do not execute this plan from local correction

- stopOnUnexpected=true
- uncertainOutcomeNoReplay=true
- authorized=false executed=false transportsDisabled=true

## Evidence destinations (not created by this local correction)

- Reset evidence: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F18_QUALIFICATION_RESET_HOSTED_REQUAL/hosted/qualification-reset/qualify-result.json`
- Founder auth artifact: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F18_QUALIFICATION_RESET_HOSTED_REQUAL/hosted/qualification-reset/FOUNDER_AUTH.json`
- Complete qual evidence: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F18_QUALIFICATION_RESET_HOSTED_REQUAL/hosted/qualify-from-00118/qualify-result.json`
- Plan record: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F18_QUALIFICATION_RESET_PROPOSED_PLAN_20260918/PROPOSED_HOSTED_REQUAL_PLAN.md`

Offline validation must keep hosted transports disabled. Do not execute this plan.
