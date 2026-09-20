# Catalog-V5 Isolated psql Poison Requal — 2026-09-16

**Verdict: REMEDIATION PASS** (stub/live-pin floor / disposable only — not production or merge auth)

## What passed
- Local gates CONTINUE on tip #102 blobs (`19e997df…`): exactly 4 allowlisted files vs HOLD `0ba4e293…`; independent-reference blob unchanged; V5 hashes sealed.
- Local docker postgres:17.6 + host psql 17.11 bare-envelope proof: exit 0, stderr 0 bytes, LF-only framing match, strict parser accept, local bind OK.
- test:f3-db-push **127 / 126 / 0 / 1**; F3-N01–N37 + F3-T01–T25 ACTUAL spies; recognition/oracles/local-safety/M2/tsc/build OK; s0-cut2 ENV_DEPENDENT_FAIL classified.
- Additive F7 `5d480db63592b85dfdeeb3dc4b955bd9b83878f1` (parent HOLD) with tip blobs; FF-pushed head-identical OPEN DRAFT #84/#85/#86; HOLD titles retained; #102 left OPEN DRAFT unused as authority.
- Exactly one disposable reset → CLEAN_BASELINE; hosted qualify process exit 0; isolated-psql poison transport; final poison absence proven; six history rows; pending empty; V5 fingerprints EXACT through repair/retry for all six.

## Explicit non-claims
- Not production PASS; not clean 00001–00117 replay PASS; not merge/deploy authorization.
- Production `llbnliixczcqfftxpsmb` never contacted.
