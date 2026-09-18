# F16 independent QA — qualification-reset A/B HOLDs

**Reviewer**: independent Grok-family QA (not the implementer).  
**Candidate**: functional `b74c6854869acf0e826446ea0488c42469621a3b`; evidence/plan `10d2d578c18e372e633a033b31c2e515cd535a8b`; start head `1fe866ff93af77dfba55437888d3315804507222`.  
**Draft PR #112**: inspected, non-authoritative until Chief FF.  
**No Daybreak/Astra contact. No hosted/disposable/production access. No merge.**

## Verdict

**F16 ACCEPT** (local). Every material finding below is **closed**.

Overall remains **DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN**.

Floor: **DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT**.

## Fresh gates (this VM, functional tip)

| Gate | Builder claim | This QA |
| --- | --- | --- |
| `npm run test:f3-reset-design` | 29/29 | **29/29** |
| `npm run test:f3-reset` | 51/51 | **51/51** |
| `npm run test:f3-db-push` | 230/230/0/0 | **230/230/0/0** (`# tests 230` / `# pass 230` / `# fail 0` / `# cancelled 0`) |
| `node scripts/prove-f3-qualification-reset-local.mjs` | 24/17/7/6 TX | **24 pass / 0 fail / 17 checks / 7 scenarios / 6 executed TX**, `LOCAL_PG_EXECUTED` on PostgreSQL **17.11** |

## Finding dispositions

| Finding | Disposition | Evidence |
| --- | --- | --- |
| A false CLEAN_BASELINE | **closed** | Empty discovery + `auth_handle_new_user_trigger:true` / `unnest_uuid_shim:true` / `storage_policies:["unexpected_access_policy"]` is HOLD, not CLEAN_BASELINE. Qualify-main path: capture=1, transport/apply/SQL=0 (F16-A01). Auth/storage: `F13_UNSUPPORTED_MANAGED_LEFTOVER`. Unnest+empty discovery: `F13_INVENTORY_CAPTURE_CONTRADICTION` (facts retained; still not CLEAN_BASELINE). Genuine empty inventory remains CLEAN_BASELINE with no mutation. Approved leftover + named floor storage remains RESET_ELIGIBLE. Leftover + Auth HOLD without deletion expansion or wipe. Duplicate JSON still `F13_INVENTORY_CAPTURE_DUPLICATE_KEYS` at the process-byte boundary. |
| B T3 live catalog tuples | **closed** | Generated SQL after locks queries `pg_constraint` for `foreign_key\|identity\|from\|to` and requires live set ⊆ 37-tuple contract **and** live set = captured starting set. Fresh helper TX (not reconstructed): (1) unapproved FK `foreign_key\|unapproved_accounts_groups_fkey\|public.financial_accounts\|public.groups` after capture → T3 ERROR, `mutationPhaseReached=false`, processStatus=3, injected FK retained; (2) retarget `memberships_group_id_fkey` to `public.profiles` → same; (3) unchanged approved set → T7 `committed=true`, CLEAN_BASELINE. Each executed reset: capture=1, transport=1, apply=1, sql=1. `rolledBack` stayed `null` (not fabricated from exit). |
| Evidence gap (packaged TX_SUCCESS_RAW) | **closed** | Packaged `TX_SUCCESS_RAW.json` stdout reread through `parseQualificationResetTxObservationStdout` + `interpretQualificationResetTransportResult`: parsedOk, 8 observations, last event T7_COMMIT `committed=true`, interpretedCommitted=true, rolledBack=null, fabricatedFromExitAlone=false. Packaged T3 rollback RAWs contain real psql stdout/stderr (`live tuple not in FINITE_DEPENDENCY_ALLOWLIST …`). Fresh helper success + four rollback cases also carried raw stdout/stderr. |
| Preserve C4-R01–R04 | **closed** | All four tests passed in the fresh reset gate. |
| Wipe still forbidden | **closed** | `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH` on `--wipe-to-baseline` (helper WIPE_STILL_REJECTED + independent probe). |
| Migrations 00118–00123 | **closed** | Byte-identical to start head (sha256 unchanged). |
| Allowlist | **closed** | `1fe866f..10d2d57` touches only the eight authorized scripts plus the two F16 evidence dirs. `package.json` unchanged. Unauthorized files: none. |
| F15 content pin | **closed** | The eight F15 functional scripts at start head `1fe866f` are byte-equivalent to `49a91169` (not a literal ancestor). |

## Notes that are not HOLD

- Empty-discovery + `unnest_uuid_shim:true` HOLDs via inventory contradiction (shim implies `public.unnest(uuid)` must appear in discovered identities). Auth trigger and unexpected storage HOLD via the unsupported-leftover classifier. Both fail closed; wipe is not used.
- T3 reject observations stop at `T2_LOCK` because the T3 observation row is emitted only after the revalidate DO succeeds. Stderr names the live-tuple check. Honest, not a framing bypass.
- Rollback is recorded as `null` when no `rolled_back` observation exists. Physical retain-after-ERROR plus `mutationPhaseReached=false` is the rollback proof.

## Closures (tip bytes, this checkout)

- Runtime `F16_QUALIFICATION_RESET_RUNTIME_CLOSURE`: `1ca2a1ceddca278889c7ea92fc10e6a59150e06c5b4f13d4426b293fda29ee78` (count 45)
- Verification union `F16_QUALIFICATION_RESET_VERIFICATION_UNION`: `989c6c99ead2b84190486b856d7e04a1e76824f870f3bbf9438935808c8fb7ff` (count 48)
- ≠ forbidden summary `16e4757840aec5f4fb44504fbd33e8480de169553f9a1ccfb180dbde051cb66d`

Draft PR #112 remains non-authoritative until Chief FF.
