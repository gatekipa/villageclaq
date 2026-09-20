# M3 F3 DAYBREAK — CANONICAL EXPECTED REQUALIFICATION (HOLD)

- **Captured:** 9/14/2026, ~10:23 PM ET
- **Verdict:** **HOLD**
- **Functional SHA:** `2fcc65114d89f098dc5d0f7787a99cb08c643c21` (additive on `94a024ef`; blobs from `41055f2f`)
- **PR pins:** #84 / #85 / #86 (OPEN, DRAFT, UNMERGED) — titles `DAYBREAK HOLD — canonical expected requalification`
- **#95:** left OPEN DRAFT at `41055f2f` (not merged)
- **CLI:** 2.117.0 (`/workspace/f3-dbpush-qual/bin/supabase`)
- **Disposable:** `villageclaq-f3-management-api-disposable-20260913` / `jkorwnwwmdeflfntxntl` / org `eyztkzkprpmlmcabrfef`
- **Production ref forbidden:** `llbnliixczcqfftxpsmb` (never contacted)
- **Floor label:** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
- **Schema version:** `f3-full-catalog-v1`
- **Recognition:** `["manual_income"]`

## Phase 1 — Functional tip
- Compare `ebd4c20...41055f2f`: exactly 3 authorized scripts
- Siblings: `41055f2f` and `94a024ef` both parent `ebd4c20`
- Additive commit `2fcc65114d89f098dc5d0f7787a99cb08c643c21` parent=`94a024ef`, tree replaces only the 3 scripts with blobs from `41055f2f`
- Fast-forward PATCH (no force) to #84/#85/#86

## Phase 2 — Pre-hosted gate: CONTINUE
- Local PG 17.6 independent reseal proofs under `local-reference/`
- Builder ≡ reference all six; not-hosted proof vs `72af6699…`
- Module-load sealed hashes match tip
- Digests 00118–00123 exact (byte-frozen)
- `npm run test:f3-db-push`: 113 tests / **112 pass / 0 fail / 1 skipped**
- Recursive runtime closure: missing=0 unresolved=0 unexplained=0 → closure_complete=true
- CLI 2.117.0; no functional drift in extract

## Phase 3 — Disposable reset
- Identity allowlist PASS; not production PASS
- Pre-reset ambiguous_count=3 (prior residue)
- Exactly one qualification reset (DROP SCHEMA financial_core/financial_private + floor residue + history deletes) — NOT wipe helper
- Post-reset: CLEAN_BASELINE, F3 absent, poison absent, ambiguous=0, history=0

## Phase 4 — Hosted requal → HOLD at 00118
- Negatives N1–N24 + FC1–FC4: all repairCalls=0; staging dbPushCalls=0
- Floor stub+live-pin installed exact; preDbPushGates ok
- 00118: POST_COMMIT_HISTORY_FAILURE (inject) as designed
- Objects present; fingerprint_exact **FAIL**
  - expected (sealed local 17.6): `8299680fd5b3def52a981ae8c8ee097f29f13507b91d4f0799557236f1b5001c`
  - observed (hosted): `72af66999f3a53a870cd1a5d0ed99a2acb7f510c69bfe16204b9fe0f217f757f`
  - changedKeys: `acl`, `acls`, `relations` (hosted has extra service_role table ACLs on `financial_ledger_epochs`)
- repairAttempted=false; poison cleaned; no continuation; no silent reseal

## Absolute bans honored
- No production contact; no merge/deploy/delete/pause; no Daybreak Blue/Astra; no force-push; no observed→expected copy; migrations byte-frozen; recognition exact.

## Pins for Daybreak re-review
- Functional tip: `2fcc65114d89f098dc5d0f7787a99cb08c643c21`
- Source seal tip: `41055f2f0a66626c1fb3719b3b20e6fcdde9025c`
- HOLD evidence parent retained: `94a024efb53e1dd7216f8aff3ab298f72963e801`
- Prior HOLD functional: `ebd4c20bcf72500b77ea24bd7269094f3dc13b3e`
- Evidence index detached sha256: see `evidence-index.sha256`
