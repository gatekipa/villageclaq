# F16 finding closure — A HOLD / B HOLD local correction

**Supersedes** F15 LOCAL CANDIDATE READY for qualification-reset local candidate status.
Historical F15 evidence at `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F15_QUALIFICATION_RESET_LOCAL_20260917/` is preserved and **not rewritten**.

## Status
- Local: **LOCAL CANDIDATE READY**
- Overall: **DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN**
- Functional tip: `b74c6854869acf0e826446ea0488c42469621a3b`
- Starting ref: `1fe866ff93af77dfba55437888d3315804507222`
- F15 functional content pin (byte-equivalent cherry-pick, not literal descendant): `49a91169fbb53dba149f4e7bbcf3016f988f4922`
- F15 plan content pin: `206dce13d424f5303520d2b63a43768a078dda35`

## A / B closure

| Finding | F15 defect | F16 closure | Status |
| --- | --- | --- | --- |
| A false CLEAN_BASELINE | empty discovery + `auth_handle_new_user_trigger` / `unnest_uuid_shim` / unexpected `storage_policies` returned CLEAN_BASELINE | CLEAN_BASELINE requires affirmative inventory facts + classifier CLEAN; unsupported Auth/Storage HOLD; no deletion expansion; no wipe | CLOSED locally |
| B T3 exact dependency revalidation | T3 only checked allowlist crossings | After locks, live catalog `(kind,identity,from,to)` equals captured approved starting set AND 37-tuple contract; unexpected/missing/changed reject before mutation | CLOSED locally |

## Inventory matrix
See `inventory-matrix/BASELINE_AFFECTING_FIELDS.json`. CLEAN_BASELINE needs consistent affirmative evidence across all required facts. Empty object/history alone is insufficient. Duplicate JSON rejection at the process-byte boundary is preserved.

## T3 drift proofs (committed helper, real local PG 17.11)
- Unapproved FK between allowlisted tables after capture before lock → T3 reject, mutationPhaseReached=false, injected FK retained
- Approved identity retargeted to a different endpoint → same
- Unchanged approved set → T7 commit + CLEAN_BASELINE
- Preserved F15 three TX: success / unexpected-object rollback / history-mismatch rollback

## Op counts (executed TX)
See `local-pg-proof/RESULTS.json`. Capture 1 + transport/apply/sql 1 per executed reset. Rollback cases do not reach T4.

## Wipe
Still rejected: `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`

## Closures (tip bytes)
- Runtime `F16_QUALIFICATION_RESET_RUNTIME_CLOSURE`: `1ca2a1ceddca278889c7ea92fc10e6a59150e06c5b4f13d4426b293fda29ee78` (count 45)
- Verification union `F16_QUALIFICATION_RESET_VERIFICATION_UNION`: `989c6c99ead2b84190486b856d7e04a1e76824f870f3bbf9438935808c8fb7ff` (count 48)
- Independent-ref SHA-256: `3742c0396903f3e91a779deec9b62d93a879f134c186f3b4b817a19c6ca99c91`
- ≠ forbidden summary `16e4757840aec5f4fb44504fbd33e8480de169553f9a1ccfb180dbde051cb66d`

## Floor
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
