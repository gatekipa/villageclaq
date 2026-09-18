# FOUNDER REPORT — Bare-envelope psql poison transport (after PR #102)

**Verdict: REMEDIATION PASS**

Captured: 2026-09-16 12:09:57 EDT

## 1. Verdict
REMEDIATION PASS — disposable CLI 2.117.0 file-based runner + isolated psql poison transport under stub/live-pin floor ONLY — **not** production/merge auth.

Local CONTINUE + F7 additive FF to OPEN DRAFT #84/#85/#86. Exactly one disposable reset → CLEAN_BASELINE. Hosted qualify **process exit 0**; final bare `f3-poison-envelope-v1` + LF; poison absence proven; six history rows; pending empty; V5 fingerprints EXACT through repair/retry for 00118–00123.

## 2–6. Pins
| # | Item | Value |
|---|------|-------|
| 2 | Main | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| 3 | PR #83 | `a293f5958b31548ccec7591b653eff2857ae9a90` |
| 4 | HOLD evidence tip / F6 parent | `0ba4e293d5d0895e3e107a367887745a877d0756` |
| 5 | F6 (ancestry) | `1f965219d73ec4c4c3455d8119e232757bba6ee6` |
| 6 | PR #102 tip (blob source only) | `19e997dfadd9f6a8bc1a221a7edb5f6e8ec02d80` |

## 7. PR #102 vs HOLD
Exactly **4** allowlisted files: query-parse, gate, qualify, harness. Independent-reference git blob unchanged `09b6e97ee0605d4af81b027746e49a6e43ff6ff1`. V5 expected hashes sealed unchanged.

## 8–9. Functional + evidence
- **F7** (HOLD + tip blobs): `5d480db63592b85dfdeeb3dc4b955bd9b83878f1`
- Evidence commit: *(filled after push)*

## 10. PR #96–#102
#96–#101 not authority. **#102 left OPEN DRAFT** at tip `19e997df…` (candidate blob source only; unused as authority).

## 11. PRs #84/#85/#86
OPEN DRAFT UNMERGED, head-identical at `5d480db63592b85dfdeeb3dc4b955bd9b83878f1`
Title retained: **DAYBREAK HOLD — catalog-v5 self-FK RI roles + fail-closed**
FF only (no force-push).

## 12–15. Schema / envelope / module / seals
- Schema: `f3-full-catalog-v5`
- Envelope: `eb58900b492b95371decfdab86b3786afc2c8089c6b0a117497f9e0b22c41a2a`
- Independent module sha256: `3742c0396903f3e91a779deec9b62d93a879f134c186f3b4b817a19c6ca99c91`
- V5 hashes IMMUTABLE (00118–00123 as pinned)

## 16. Local gates
**CONTINUE** — test:f3-db-push **127 / 126 / 0 / 1**; ACTUAL spy negatives F3-N01–N37 OK; transport F3-T01–T25 OK; recognition 40; oracles 577; local-safety 45; M2 111; tsc PASS; next build PASS (after bind-mount node_modules). s0-cut2 ENV_DEPENDENT_FAIL classified honestly. Recursive closure complete; git verification fail-closed OK. Secret scan: fixture URLs only.

## 17. Local 17.6 psql proof
**CONTINUE** — host client `psql (PostgreSQL) 17.11 (Debian 17.11-0+deb13u1)`; container `psql (PostgreSQL) 17.6 (Debian 17.6-2.pgdg13+1)`; server `17.6 (Debian 17.6-2.pgdg13+1)`.
- exit 0; stderr 0 bytes; stdout sha256 `11efee8db8172d031b58dd6e694464473cafa48ebed638fb7be96becf8aeaf6d` len=200
- framing matches assumed LF-only (no CRLF; single trailing 0x0A) — no parser relaxation
- PG `json_build_object()::text` emits spaces around `:` — accepted by strict duplicate-key-safe parser (not reconstruction)
- live bind to frozen LOCAL connection metadata OK; repair-gate envelope shape OK

## 18–20. Disposable + reset + floor
- Ref `jkorwnwwmdeflfntxntl` / name villageclaq-f3-management-api-disposable-20260913 / org `eyztkzkprpmlmcabrfef` / ≠ production `llbnliixczcqfftxpsmb`
- Exactly **one** reset → **CLEAN_BASELINE** (`ambiguous_objects=none`)
- Floor: `DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT`
- CLI **2.117.0** isolated; ambient DATABASE_URL/PG* rejected; password via env only (never argv/logs/evidence)

## 21–22. Hosted qualification
**PASS** (stub/live-pin floor limitation):
- Poison transport: **isolated-psql** (`psql -X -q -t -A -w -v ON_ERROR_STOP=1`)
- Final poison: exit/status 0; stderr 0; stdout sha256 `b13be10ffcd515af2b0e34b54400484c7bf7715ae6d786ff585c661551f70d02` len=175; parser `valid_json_exact_schema`; `poisonPresent=false`; live bind `postgres`/`postgres` to frozen disposable target
- Migration list: six Local|Remote pairs; **pending empty**
- All six: POST_COMMIT_HISTORY_FAILURE → repairAuthorized → repair 0 → retry; V5 fingerprint EXACT after poison-cleanup / repair / retry
- Process exit **0**; durable FILE `--evidence-out` written
- **No second reset. No second hosted retry.**

## 23–24. Recognition + frozen digests
Recognition: `["manual_income"]`. Frozen migration digests unchanged.

## 25–27. Bans
Production never contacted. No force-push. No merge of #84/#85/#86/#96–#102. No project delete/pause. No Daybreak Blue/Astra. No silent patch/reseal. No reconstruction. Parser not weakened for CLI banner/array wrapper. Scope not expanded beyond 4 tip files. #102 unused as authority.

## 28. Evidence package
`docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_PSQL_POISON_REQUAL_20260916/`
New superseding evidence dir; prior V5 / STRICT_POISON dirs untouched. Includes local gates, local 17.6 psql proof, phase-b reset inventories, qualify-result, chronology, founder K checklist, git evidence.

## Remediation
**PASS** (disposable / stub+live-pin floor only — not production/merge auth)
