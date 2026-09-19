# PROPOSED HOSTED REQUALIFICATION PLAN — PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE

**Status:** PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE
**Local status inherited:** LOCAL CANDIDATE READY
**QA identity:** IMPLEMENTATION ACCEPT
**Overall status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN
**Label:** F21 PRESERVE-BASELINE CANDIDATE — PROPOSED HOSTED REQUAL ONLY
**Policy / success identity:** `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**
This document does not authorize wipe, hosted reset, credential use, Daybreak/Astra contact, Management API apply, enriched hosted capture, or merge.

## Bound identities (candidate-bound; do not rebind)

| Role | Value |
|------|-------|
| Functional tip (frozen, unchanged) | `3fe7314ab7cfb2abbcd66d8eb09f26ba2ed0a9e0` |
| Evidence tip (local proof package) | `964fe8431f7ca22534a4277246e8330732373f64` |
| Contract tip | `b7d16544cdbb86ce47baba329835bd93dcb16d6d` |
| Policy / success / already-clean | `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` |
| Envelope | `f21-qualification-reset-inventory-v1` / `1` |
| Membership record | `f21-qualification-reset-membership-v1` / `1` |
| Policy id | `f21-btree-gist-extension-preserve-scoped-v1` |
| Classification | `EXTENSION_PRESERVE_SCOPED` |
| Authorized extension | `btree_gist` |
| Live wipe / classifyInventory success (unchanged) | `CLEAN_BASELINE` — **not reused** for this path |
| Scope/SQL identity SHA-256 | `d95d96e02a3a1844977d852fa23a64f742b79b5f767984b6a2d4512cbe02632f` |
| CLI pin | `2.117.0` |
| QA verdict identity | **IMPLEMENTATION ACCEPT** |
| PRs | #84 / #85 / #86 OPEN DRAFT UNMERGED, head-identical, DAYBREAK HOLD titles |

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**

## Closures (from existing local package `DIGESTS.json`)

Source: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F21_PRESERVE_BASELINE_LOCAL_20260919/closure/DIGESTS.json` at evidence tip `964fe8431f7ca22534a4277246e8330732373f64` (bytes of functional tip `3fe7314ab7cfb2abbcd66d8eb09f26ba2ed0a9e0`).

- Runtime closure label: `F19_QUALIFICATION_RESET_RUNTIME_CLOSURE`
- Runtime closure SHA-256: `c0f06211aa6018c153f9b735ce489aba50274ce997d627a1619803b24c5804e3` (count 45)
- Verification-union label: `F19_QUALIFICATION_RESET_VERIFICATION_UNION`
- Verification-union SHA-256: `5194bd761e183c48752bd232da18840ad8327d09f95369d195a84ef285dd0d43` (count 48)
- Runtime and union identities are distinct and must not be collapsed
- Forbidden summary (must remain unequal): `16e4757840aec5f4fb44504fbd33e8480de169553f9a1ccfb180dbde051cb66d`
- Independent reference: `3742c0396903f3e91a779deec9b62d93a879f134c186f3b4b817a19c6ca99c91`
- F18 runtime baseline (cited, not expected): `c6ecf620e41dbbce340e2207b2b9b793c8df750c703d245363139b497526a392`
- F18 union baseline (cited, not expected): `b9a9e6b7ad95f6e5935d05bb6c41bdabe543f0f88a086bc6b28fcb07dd03be78`
- F17 runtime baseline (cited, not expected): `0db1c600c620c0e406038fa3ebc5c4d7df6104bce64545ef9e16a63a6237c741`
- F17 union baseline (cited, not expected): `d3fd2eb52a2adc2a1f963a54955b888b2d3e8eadea0283894c4a51f5effc41cb`
- Proof helper: `scripts/prove-f3-qualification-reset-local.mjs`
- Apply argv: `-X -q -t -A -w -v ON_ERROR_STOP=1 -f [FILE]`

F19 artifacts and founder-auth bindings issued at `dfbeb11b49f7e9b061a4c700e0335d125ac669e2` **cannot** authorize this preserve path (scope digest, closure, envelope, and success identity all changed).

## Inheritance of local F21 proof (not hosted identity)

This plan **inherits** the tip-bound local package at
`docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F21_PRESERVE_BASELINE_LOCAL_20260919/`
(`LOCAL_PG_EXECUTED` on PostgreSQL 17.11; prove HEAD = functional tip `3fe7314…`).

Inherited local facts (not hosted proof):

- Helper `LOCAL_PG_EXECUTED=true`, `mustLocal=false`, `overallOk=true`
- 30 checks / 12 scenarios / 9 executed TX / 42 pass / 0 fail
- Focused suites at the same functional tip: design 33/33, reset 70/70 (103/103 combined), harness 115/115
- Preserve TX: `btree_gist` present before and after; 264 `deptype='e'` members before and after; 188 typed members captured **on the local fixture**
- Approved leftovers / authenticated 00118–00123 history keys removed under the preserve policy
- No `DROP EXTENSION` / no `CASCADE` in the preserve path
- Qual-from-00118 on a preinstalled local extension: induced `F3_ABORT: has_group_permission overload count=0` while the extension remained — a local observation, **not** a hosted result
- Hosted 188 ownership remains **CANNOT CONFIRM**

Do not treat inherited F19/F18 combined suites, local 188 typed members, or local 00118 abort as this run's hosted identity.

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**

## Target

- Accept disposable only: `jkorwnwwmdeflfntxntl` (`jkorwnwwmdeflfntxntl`)
- Production forbidden: `llbnliixczcqfftxpsmb` (`llbnliixczcqfftxpsmb`)
- Reject: `llbnliixczcqfftxpsmb`, transaction pooler `:6543`
- Production contact is forbidden even for read/inventory
- Daybreak / Astra contact is forbidden

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**

## Secure placeholders

- Database URL: `[REDACTED]`
- Password: `[REDACTED]`
- Founder authorization artifact must not contain connection material
- F19 / F20 / F13 founder-auth artifacts are stale for this candidate

## Wipe / budget / preserve baseline

- Wipe remains `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH` — **no wipe**
- Success / already-clean identity is `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` — **not** `CLEAN_BASELINE`
- alreadyClean `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` is a no-op and does not consume the reset budget
- Consumed reset only after a confirmed committed mutation
- Budget: `constrainedResets=1`, `completeQualsFrom00118=1`, `secondReset=false`
- Exactly **one** constrained `--qualification-reset` under preserve policy `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`
- Exactly **one** complete qual-from-00118 (`--no-wipe --prep-floor --sequence-f3 --floor-mode=stub-live-pin`)
- `classifyInventory` / wipe / pre-stub-floor clean-check keep historical `CLEAN_BASELINE` meaning

## Exact reset command

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**

```bash
node scripts/qualify-f3-db-push-disposable.mjs --qualification-reset --founder-authorization-artifact=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F21_PRESERVE_BASELINE_HOSTED_REQUAL/hosted/qualification-reset/FOUNDER_AUTH.json --evidence-out=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F21_PRESERVE_BASELINE_HOSTED_REQUAL/hosted/qualification-reset/qualify-result.json
```

Founder authorization (when later issued by a separate hosted-authorization ticket, not this package) must bind disposable target + functional tip `3fe7314ab7cfb2abbcd66d8eb09f26ba2ed0a9e0` + runtime closure `c0f06211aa6018c153f9b735ce489aba50274ce997d627a1619803b24c5804e3` + scope/SQL identity `d95d96e02a3a1844977d852fa23a64f742b79b5f767984b6a2d4512cbe02632f` + budget + policy `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`. Missing verdict must HOLD `F21_PRESERVE_BASELINE_VERDICT_REQUIRED` (must not fall back to `CLEAN_BASELINE`).

## Exact qualify-from-00118 command

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**

```bash
node scripts/qualify-f3-db-push-disposable.mjs --no-wipe --prep-floor --sequence-f3 --floor-mode=stub-live-pin --evidence-out=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F21_PRESERVE_BASELINE_HOSTED_REQUAL/hosted/qualify-from-00118/qualify-result.json
```

No wipe. No second reset. No second complete qual.

## CLI / Management API

- CLI **2.117.0** apply and repair remain separate commands
- Management API apply is **never** authorized
- applyRepairSeparation=true
- Management API apply authorized: false

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**

## Hosted 188 — CANNOT CONFIRM

Hosted function-like identities (~188 names) remain **CANNOT CONFIRM** as `btree_gist` `deptype='e'` members.

- Name-only `gbt_*` / `*_dist` rows HOLD (`F13_UNEXPECTED_OBJECT_OR_DEPENDENCY`)
- Local fixture typed-member count 188 is **not** hosted membership proof
- Enriched hosted capture (`pg_depend` / OID / `extname` / `deptype`) is **not** authorized by this plan
- Hosted 188 CANNOT CONFIRM until enriched capture is **separately authorized**
- This plan must not treat hosted names as `EXTENSION_PRESERVE_SCOPED`

## F20 DESIGN_HOLD (historical)

F20 `DESIGN_HOLD` / `F20_EXTENSION_MEMBERSHIP_SERIALIZATION_UNSUPPORTED` remains **historical**:

- `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F20_CATALOG_COMPAT_DESIGN_20260919/`
- `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F20_EXTENSION_PRESERVE_FEASIBILITY_20260919/`

This plan does **not** implement extension-removal, `DROP EXTENSION`, `ALTER EXTENSION`, Part A catalog locks, or catalog-privilege exceptions. F20-R5 is out of scope because this path does not drop the extension or authenticated members.

## Object / dependency / history scope

- Object count: **113** (112 destructive + 1 preserve-only `ext.btree_gist`)
- Dependency count: **43 = 31 migration-created + 12 historicalNoticeOnly**
- History key count: **6**
- `ext.btree_gist` is **PRESERVE** — not a T4 mutate target; T6 must not require it absent
- Part B six additional historical FK tuples are recognition-only; no new table-deletion authority; no CASCADE

### Objects

- `function` `public.post_financial_opening_cash(jsonb)` dropOrder=10 DROP
- `function` `public.get_financial_cashbook(uuid,timestamp with time zone,timestamp with time zone,uuid,text,integer,integer)` dropOrder=20 DROP
- `function` `public.get_financial_projection_bundle(uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone)` dropOrder=30 DROP
- `function` `public.post_financial_command(jsonb)` dropOrder=40 DROP
- `function` `public.correct_financial_event(jsonb)` dropOrder=50 DROP
- `function` `public.enqueue_outbound_notification(text,uuid,notification_channel,uuid,text)` dropOrder=60 DROP
- `function` `public.execute_member_transfer(jsonb)` dropOrder=70 DROP
- `function` `public.request_member_transfer(jsonb)` dropOrder=80 DROP
- `function` `public.has_group_permission(uuid,text,uuid)` dropOrder=90 DROP
- `function` `public.compute_member_standing(uuid)` dropOrder=100 DROP
- `function` `public.m2_is_valid_iana_timezone(text)` dropOrder=110 DROP
- `function` `public.notification_policy_set_updated_at()` dropOrder=120 DROP
- `function` `public.uuid_generate_v5(uuid,text)` dropOrder=130 DROP
- `function` `financial_core.post_f3_opening_cash(jsonb)` dropOrder=200 DROP
- `function` `financial_core.f3_opening_safe_text(text,integer,boolean)` dropOrder=210 DROP
- `function` `financial_core.guard_f3_opening_provenance()` dropOrder=220 DROP
- `function` `financial_core.correct_f3_command(jsonb)` dropOrder=230 DROP
- `function` `financial_core.check_f3_correction_closure()` dropOrder=240 DROP
- `function` `financial_core.guard_f3_correction_lineage()` dropOrder=250 DROP
- `function` `financial_core.assert_f3_correction_postings(uuid,jsonb)` dropOrder=260 DROP
- `function` `financial_core.resolve_f3_correction_replacement(jsonb,jsonb,boolean)` dropOrder=270 DROP
- `function` `financial_core.f3_correction_posting_json(uuid,uuid,uuid,uuid,text,timestamp with time zone,numeric,financial_control_class,uuid,uuid,uuid,financial_category_class,uuid,uuid)` dropOrder=280 DROP
- `function` `financial_core.f3_correction_child_id(uuid,uuid,text)` dropOrder=290 DROP
- `function` `financial_core.f3_correction_reason(jsonb)` dropOrder=300 DROP
- `function` `financial_core.f3_correction_signed_amount(numeric,text)` dropOrder=310 DROP
- `function` `financial_core.f3_correction_timestamp(timestamp with time zone)` dropOrder=320 DROP
- `function` `financial_core.f3_correction_fingerprint(jsonb)` dropOrder=330 DROP
- `function` `financial_core.f3_correction_canonical(jsonb)` dropOrder=340 DROP
- `function` `financial_core.guard_f3_correction_payload()` dropOrder=350 DROP
- `function` `financial_core.projection_cashbook_rows(uuid,boolean)` dropOrder=360 DROP
- `function` `financial_core.format_projection_amount(numeric,text)` dropOrder=370 DROP
- `function` `financial_core.post_f3_command(jsonb,jsonb)` dropOrder=380 DROP
- `function` `financial_core.lock_f3_identity(uuid,uuid,text,text,text)` dropOrder=390 DROP
- `function` `financial_core.check_f3_posting_closure()` dropOrder=400 DROP
- `function` `financial_core.guard_f3_posting_closure()` dropOrder=410 DROP
- `function` `financial_core.guard_f3_payload()` dropOrder=420 DROP
- `function` `financial_core.f3_fingerprint(jsonb)` dropOrder=430 DROP
- `function` `financial_core.f3_canonical(jsonb)` dropOrder=440 DROP
- `function` `financial_core.f3_trim(text)` dropOrder=450 DROP
- `function` `financial_core.f3_timestamp(jsonb)` dropOrder=460 DROP
- `function` `financial_core.f3_amount(jsonb,text)` dropOrder=470 DROP
- `function` `financial_core.f3_currency(jsonb)` dropOrder=480 DROP
- `function` `financial_core.f3_uuid(jsonb,boolean)` dropOrder=490 DROP
- `function` `financial_core.lock_financial_occurrence(uuid,text,text,text,uuid)` dropOrder=500 DROP
- `function` `financial_core.assert_finances_manage(uuid)` dropOrder=510 DROP
- `function` `financial_core.can_view_finances(uuid)` dropOrder=520 DROP
- `function` `financial_core.can_manage_finances(uuid)` dropOrder=530 DROP
- `function` `financial_core.check_event_balance_from_posting()` dropOrder=540 DROP
- `function` `financial_core.check_event_balance_from_event()` dropOrder=550 DROP
- `function` `financial_core.assert_financial_event_balanced(uuid)` dropOrder=560 DROP
- `function` `financial_core.guard_financial_posting_history()` dropOrder=570 DROP
- `function` `financial_core.guard_financial_event_history()` dropOrder=580 DROP
- `function` `financial_core.guard_financial_event_epoch()` dropOrder=590 DROP
- `function` `financial_core.guard_financial_category()` dropOrder=600 DROP
- `function` `financial_core.guard_financial_fund()` dropOrder=610 DROP
- `function` `financial_core.guard_financial_account()` dropOrder=620 DROP
- `function` `financial_core.currency_scale(text)` dropOrder=630 DROP
- `function` `financial_private.guard_ledger_epoch()` dropOrder=640 DROP
- `table` `financial_core.opening_provenances` dropOrder=700 DROP
- `table` `financial_core.correction_command_payloads` dropOrder=710 DROP
- `table` `financial_core.posting_command_payloads` dropOrder=720 DROP
- `table` `public.financial_postings` dropOrder=730 DROP
- `table` `public.financial_events` dropOrder=740 DROP
- `table` `public.financial_categories` dropOrder=750 DROP
- `table` `public.financial_funds` dropOrder=760 DROP
- `table` `public.financial_accounts` dropOrder=770 DROP
- `table` `public.financial_ledger_epochs` dropOrder=780 DROP
- `table` `financial_private.internal_financial_tenants` dropOrder=790 DROP
- `table` `financial_private.epoch_transitions` dropOrder=800 DROP
- `table` `public.notification_policy_triggers` dropOrder=900 DROP
- `table` `public.notification_policy_occurrences` dropOrder=910 DROP
- `table` `public.notification_policies` dropOrder=920 DROP
- `table` `public.position_assignments` dropOrder=930 DROP
- `table` `public.position_permissions` dropOrder=940 DROP
- `table` `public.group_positions` dropOrder=950 DROP
- `table` `public.hosting_swap_requests` dropOrder=960 DROP
- `table` `public.hosting_assignments` dropOrder=970 DROP
- `table` `public.hosting_rosters` dropOrder=980 DROP
- `table` `public.payment_obligation_applications` dropOrder=990 DROP
- `table` `public.payments` dropOrder=1000 DROP
- `table` `public.contribution_obligations` dropOrder=1010 DROP
- `table` `public.relief_remittances` dropOrder=1020 DROP
- `table` `public.relief_claims` dropOrder=1030 DROP
- `table` `public.relief_enrollments` dropOrder=1040 DROP
- `table` `public.relief_plans` dropOrder=1050 DROP
- `table` `public.fines` dropOrder=1060 DROP
- `table` `public.member_transfers` dropOrder=1070 DROP
- `table` `public.invitations` dropOrder=1080 DROP
- `table` `public.elections` dropOrder=1090 DROP
- `table` `public.events` dropOrder=1100 DROP
- `table` `public.meeting_minutes` dropOrder=1110 DROP
- `table` `public.announcements` dropOrder=1120 DROP
- `table` `public.notifications_queue` dropOrder=1130 DROP
- `table` `public.loans` dropOrder=1140 DROP
- `table` `public.projects` dropOrder=1150 DROP
- `table` `public.group_subscriptions` dropOrder=1160 DROP
- `table` `public.memberships` dropOrder=1170 DROP
- `table` `public.groups` dropOrder=1180 DROP
- `table` `public.profiles` dropOrder=1190 DROP
- `table` `public.organizations` dropOrder=1200 DROP
- `table` `public.__f3_acl_platform_canary_20260915` dropOrder=1210 DROP
- `sequence` `public.__f3_acl_platform_canary_20260915_id_seq` dropOrder=1220 DROP
- `type` `public.financial_account_kind` dropOrder=1300 DROP
- `type` `public.financial_account_status` dropOrder=1310 DROP
- `type` `public.financial_category_class` dropOrder=1320 DROP
- `type` `public.financial_config_status` dropOrder=1330 DROP
- `type` `public.financial_control_class` dropOrder=1340 DROP
- `type` `public.financial_event_class` dropOrder=1350 DROP
- `type` `public.financial_event_status` dropOrder=1360 DROP
- `type` `public.notification_channel` dropOrder=1370 DROP
- `schema` `financial_core` dropOrder=1400 DROP
- `schema` `financial_private` dropOrder=1410 DROP
- `extension` `btree_gist` dropOrder=1500 **PRESERVE** (not a T4 mutate target; no DROP EXTENSION; no ALTER EXTENSION; no individual DROP of members)

### Dependencies (complete kind/identity/from/to)

Migration-created (31):

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

historicalNoticeOnly (12; first six historical + six F21-C9 additions; recognition only):

- `foreign_key` `memberships_group_id_fkey` from `public.memberships` to `public.groups` historicalNoticeOnly
- `foreign_key` `projects_group_id_fkey` from `public.projects` to `public.groups` historicalNoticeOnly
- `foreign_key` `notification_policies_group_id_fkey` from `public.notification_policies` to `public.groups` historicalNoticeOnly
- `foreign_key` `notification_policy_occurrences_group_id_fkey` from `public.notification_policy_occurrences` to `public.groups` historicalNoticeOnly
- `foreign_key` `position_assignments_membership_id_fkey` from `public.position_assignments` to `public.memberships` historicalNoticeOnly
- `foreign_key` `notification_policy_triggers_policy_id_fkey` from `public.notification_policy_triggers` to `public.notification_policies` historicalNoticeOnly
- `foreign_key` `group_positions_group_id_fkey` from `public.group_positions` to `public.groups` historicalNoticeOnly
- `foreign_key` `groups_organization_id_fkey` from `public.groups` to `public.organizations` historicalNoticeOnly
- `foreign_key` `memberships_user_id_fkey` from `public.memberships` to `public.profiles` historicalNoticeOnly
- `foreign_key` `notification_policy_occurrences_superseded_by_fkey` from `public.notification_policy_occurrences` to `public.notification_policy_occurrences` historicalNoticeOnly
- `foreign_key` `position_assignments_position_id_fkey` from `public.position_assignments` to `public.group_positions` historicalNoticeOnly
- `foreign_key` `position_permissions_position_id_fkey` from `public.position_permissions` to `public.group_positions` historicalNoticeOnly

### History keys

- `20260913173000` / `f3_bounded_financial_epoch_foundation` ← `00118_f3_bounded_financial_epoch_foundation.sql`
- `20260913173001` / `f3_01_core_ledger_foundation` ← `00119_f3_01_core_ledger_foundation.sql`
- `20260913173002` / `f3_02_secure_posting_idempotency` ← `00120_f3_02_secure_posting_idempotency.sql`
- `20260913173003` / `f3_03_projection_read_proof` ← `00121_f3_03_projection_read_proof.sql`
- `20260913173004` / `f3_04_correction_reversal` ← `00122_f3_04_correction_reversal.sql`
- `20260913173005` / `f3_05_opening_cash_command` ← `00123_f3_05_opening_cash_command.sql`

## Preconditions

- HEAD equals bound functional tip `3fe7314ab7cfb2abbcd66d8eb09f26ba2ed0a9e0`
- Evidence package at `964fe8431f7ca22534a4277246e8330732373f64` is the inherited local proof — not hosted authorization
- Founder authorization artifact (when separately issued) binds target + functionalTip + runtimeClosure + scopeSqlIdentity + budget + `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`
- Inventory capture uses the F21 envelope / typed membership survival chain; F13 v1 and F20 v2 bodies fail closed
- alreadyClean `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` is a no-op and does not consume the reset budget
- RESET_ELIGIBLE leftovers require `eligible===true` before one gated apply
- Authenticated preserve residuals must not be routed through `CLEAN_BASELINE`
- Hosted 188 remains CANNOT CONFIRM until enriched capture is separately authorized

## Expected deliberate failures from the actual runner

- `node scripts/qualify-f3-db-push-disposable.mjs --wipe-to-baseline` → `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`
- `node scripts/qualify-f3-db-push-disposable.mjs --qualification-reset` → `F13_FLAG_NOT_AUTHORIZATION`
- `node scripts/qualify-f3-db-push-disposable.mjs --qualification-reset --prep-floor --founder-authorization-artifact=docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F21_PRESERVE_BASELINE_HOSTED_REQUAL/hosted/qualification-reset/FOUNDER_AUTH.json` → `F13_INVALID_FLAG_COMBINATION`
- Stale F19 founder-auth / old 37-tuple digest → `F13_FOUNDER_AUTH_MISMATCH` / `F13_FOUNDER_AUTH_STALE`
- Missing preserve verdict on emit → `F21_PRESERVE_BASELINE_VERDICT_REQUIRED`
- Production ref `llbnliixczcqfftxpsmb` → immediate refuse

## Sequencing / evidence finalization

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**

1. Offline validate this plan with disabled hosted transports
2. Confirm disposable target `jkorwnwwmdeflfntxntl` only; refuse production `llbnliixczcqfftxpsmb` immediately
3. Run exactly one constrained `--qualification-reset` under `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` if leftovers are eligible, or record alreadyClean no-op
4. If reset commits, consume `constrainedResets=1`; do not run a second reset
5. If alreadyClean, `constrainedResets` remains unused; still run exactly one complete qual-from-00118
6. Run exactly one complete qualify-from-00118: `--no-wipe --prep-floor --sequence-f3 --floor-mode=stub-live-pin`
7. Stop on first unexpected failure; `UNCERTAIN_COMMIT` forbids replay
8. Finalize evidence bytes, then Chief/QA review; do not execute this plan from local candidate packaging

- stopOnUnexpected=true
- uncertainOutcomeNoReplay=true
- authorized=false executed=false transportsDisabled=true

## Evidence destinations (not created by this packaging)

- Reset evidence: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F21_PRESERVE_BASELINE_HOSTED_REQUAL/hosted/qualification-reset/qualify-result.json`
- Founder auth artifact: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F21_PRESERVE_BASELINE_HOSTED_REQUAL/hosted/qualification-reset/FOUNDER_AUTH.json`
- Complete qual evidence: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F21_PRESERVE_BASELINE_HOSTED_REQUAL/hosted/qualify-from-00118/qualify-result.json`
- Plan record: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F21_PRESERVE_BASELINE_PROPOSED_PLAN_20260919/PROPOSED_HOSTED_REQUAL_PLAN.md`

Those hosted destinations must not be created by this docs-only package. Offline validation must keep hosted transports disabled.

## What this package is not

- Not hosted requalification authorization
- Not hosted requalification PASS
- Not a wipe
- Not Management API apply
- Not production contact
- Not Daybreak / Astra contact
- Not enriched hosted-188 capture
- Not merge
- Not F3-06
- Not extension-removal / F20 DESIGN_HOLD closure
- Not a claim that local 188 typed members prove hosted membership

**PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE.**

Keep #84 / #85 / #86 **OPEN DRAFT UNMERGED**. Titles remain DAYBREAK HOLD.
**Status remains:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
