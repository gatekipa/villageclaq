# M2 Implementation Summary — 2026-09-12 (Daybreak HOLD remediation)

**OVERALL VERDICT: PASS — M2 IMPLEMENTATION REMEDIATED; FULL DISPOSABLE SECURITY REQUALIFICATION PASS; READY FOR DAYBREAK RE-REVIEW**

**DO NOT MERGE.**  
**DO NOT APPLY 00117 TO PRODUCTION.**  
**NO REAL SENDS. NO PRODUCER CUTOVER. NO UI.**

## Pins

| Pin | Value |
|-----|-------|
| Planning authority | PR #81 @ `dc35c39a5b94b354c02e3f0f091271e74b8e93e5` |
| Base main | `0c147f8e1e7aadbfd14583f6a9bef465c2217fe1` |
| Branch | `security/m2-notification-policy-foundation-20260912` |
| Draft PR | https://github.com/gatekipa/villageclaq/pull/82 |
| **NEW functional SHA** | `e47ddd6b8c06c2933e5a297f7b48f1076496da40` |
| Prior HOLD functional SHA | `a9a48447b4e48f9c800f4115bacf47a9e67c9ceb` |
| Superseded functional SHA | `046cadcfac6e7b14f85e87d80f5025f8f3b493d4` |
| Superseded evidence tip | `b7d41d387ec48e6c9d8e88521dddbd23b47d8994` / `fa8771a645fe0900a5d797ab1d9caf6fde0cf984` |
| 00117 path | `supabase/migrations/00117_m2_notification_policy_foundation.sql` |
| **NEW 00117 SHA-256** | `aa1c545ce174b537035c0fa95576e3af9157aa132e52476e01a7bfd3ab81cb02` |
| Superseded 00117 SHA-256 | `6e91d0997ee03df57a6174c37fec50f6f812fcdc54412cf8fa115019863eeb42` |
| Production project | `llbnliixczcqfftxpsmb` — **never mutated** |
| Production migrations | remain **31** |
| SECURITY DEFINER added | **NONE** |

## What this remediation changed

- **00117 preflight/postconditions only** (same path): exact ONE `has_group_permission` and ONE `enqueue_outbound_notification`; pin identity/result/owner/`prosecdef`/`proconfig`/def MD5/prosrc MD5 + ACL set equality both EXCEPT directions **before** DDL; snapshot only after pins pass; after DDL recompare fingerprint+ACL including enqueue owner/`proconfig`.
- Queue **TABLE** ACL exact live set (postgres owner/full including `MAINTAIN`; authenticated SELECT; service_role SELECT; no authenticated/service_role table INSERT/UPDATE/DELETE; no anon/PUBLIC).
- Queue **COLUMN** `attacl` exact five UPDATE rows: `status`, `error_message`, `attempts`, `sent_at`, `data` — grantor postgres, no grant option. Postcondition set `{attempts,data,error_message,sent_at,status}`.
- ACL via `aclexplode` + role resolution; **not** raw ACL text order.
- Disposable floor adapted **outside** 00117 to reproduce the exact production security floor (PG 17 required for `MAINTAIN`). Chief supplement: fail-closed `assertLiveQueueAcl()` to the exact 10-row TABLE aclexplode set + five column UPDATE attacl rows. **00117 bytes unchanged.**
- Occurrence DML evidence: AUTH INSERT/UPDATE/DELETE → `PERMISSION_DENIED` / `42501`; service_role SELECT ALLOW; service_role INSERT/UPDATE/DELETE DENY `42501`; seeded occurrence unchanged. Empty-stdout denial shortcut banned (R25).
- Negative drift (R15): 21/21 `M2_ABORT` (hgp body/owner/prosecdef/search_path/extra EXECUTE/grant option/overload; enqueue body/return/owner/prosecdef/search_path/authenticated EXECUTE/PUBLIC EXECUTE/grant option/overload; queue table unexpected DML; column sixth UPDATE / missing one / wrong grantor / WITH GRANT OPTION).

Unchanged in business semantics: evaluator, contracts, settings.manage RLS, dormant defaults, no new SECURITY DEFINER, no queue grants, no enqueue modify, no producer wiring, no UI.

## Tests (R28)

| Suite | Result |
|-------|--------|
| `scripts/test-notification-policy.mjs` | **39/39 PASS** |
| `scripts/test-notification-policy-contracts.mjs` | **43/43 PASS** |
| `scripts/test-m2-cut2-nonregression.mjs` (M2-C2-01..20) | **20/20 PASS** |
| `scripts/test-m2-static-security.mjs` | **9/9 PASS** |
| Combined `npm run test:m2` | **111/111 PASS** |
| Disposable schema qualify (PG 17.11 :5433) | **66/66 PASS** |
| Negative drift | **21/21 PASS** |
| AUTH occurrence INSERT/UPDATE/DELETE | **PERMISSION_DENIED 42501** |
| service_role SELECT / INSERT / UPDATE / DELETE | **ALLOW / DENY 42501 / DENY 42501 / DENY 42501** |
| Occurrence integrity after denied DML | **unchanged** |
| `npx tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** |

## Live pins reproduced on disposable (and required by 00117)

### has_group_permission
- overload 1; `gid uuid, perm_key text, uid uuid` → boolean
- owner postgres; SECURITY DEFINER; `ARRAY['search_path=""']`
- def MD5 `695368464e97297fbf0f90ce7345162f`; prosrc MD5 `96a296dfd541c7fc75ec68c4da1d92ff`
- ACL only: authenticated / postgres / service_role EXECUTE, grantor postgres, no grant option

### enqueue_outbound_notification
- overload 1; identity `p_notification_type text, p_domain_object_id uuid, p_channel notification_channel, p_recipient_membership_id uuid, p_locale text`
- `TABLE(queue_id uuid, result text)`
- owner postgres; SECURITY DEFINER; `ARRAY['search_path=""']`
- def MD5 `dbdb16cdced6cae9cbdbfb6a6a9f421f`; prosrc MD5 `3fa76af51e431ccbd31eb033dcff0b80`
- ACL only: postgres / service_role EXECUTE, grantor postgres, no grant option

### notifications_queue (Chief supplement — exact fixture target)
Table ACL via aclexplode (10 rows only):
- authenticated | SELECT | postgres | false
- postgres | DELETE | postgres | false
- postgres | INSERT | postgres | false
- postgres | MAINTAIN | postgres | false
- postgres | REFERENCES | postgres | false
- postgres | SELECT | postgres | false
- postgres | TRIGGER | postgres | false
- postgres | TRUNCATE | postgres | false
- postgres | UPDATE | postgres | false
- service_role | SELECT | postgres | false

No anon/PUBLIC. No authenticated/service_role table INSERT/UPDATE/DELETE.

Column attacl: exactly five `service_role` UPDATE rows on `attempts`, `data`, `error_message`, `sent_at`, `status` (grantor postgres, no grant option).

Fixture `assertLiveQueueAcl()` fail-closes to both sets before 00117. Qualify records floor + post-00117 equality. **00117 SHA-256 unchanged.**

## Dormancy

Immediately after 00117 COMMIT: policy/trigger/occurrence rows = 0; `notifications_queue` delta = 0.  
No DB trigger on `notifications_queue` from this migration.  
No producer import of the M2 engine. Live crons unchanged.

## Evidence artifacts

- `docs/evidence/M2_IMPLEMENTATION_SUMMARY_20260912.md` (this file)
- `docs/evidence/M2_CUT2_NONREGRESSION_RESULTS_20260912.json`
- `docs/evidence/M2_DISPOSABLE_SCHEMA_RESULTS_20260912.json`
- `docs/evidence/M2_IMPLEMENTATION_FILE_SCOPE_20260912.json`
- `docs/evidence/M2_DORMANCY_PROOF_20260912.json`
- `docs/evidence/M2_MIGRATION_SECURITY_FINGERPRINTS_20260912.json`
- `docs/evidence/M2_ACL_TUPLES_20260912.json` (new)
- `docs/evidence/M2_OCCURRENCE_DML_BEHAVIORAL_20260912.json` (new)
- `docs/evidence/M2_NEGATIVE_DRIFT_RESULTS_20260912.json` (new)

## Production

**ZERO writes** to `llbnliixczcqfftxpsmb`. Live fingerprints were read-only confirmed earlier and pinned exactly. Fixture was adapted outside 00117. No deploy, no merge, no sends, no env changes.

## Left open / unmerged

- PR #81 planning-only
- PR #69 / #70 open, unmerged, not rebased
- This PR #82 stays **draft**

## Writer authority

No SECURITY DEFINER occurrence writer was added. Foundation does not require one.  
Writers remain a later ticket.
