# Catalog-V5 Strict Original-Stdout Poison Requal — 2026-09-16

**Verdict: HOLD**

## What passed
- Local gates CONTINUE on tip #101 (`43ebd223…`): exactly 4 allowlisted files vs E5.1; independent-reference blob unchanged; V5 hashes sealed; test:f3-db-push 126/125/0/1; ACTUAL spy negatives F3-N01–N37 OK; recursive closure complete; git verification fail-closed OK.
- F6 additive commit `1f965219…` (parent E5.1) with tip blobs; FF-pushed head-identical to OPEN DRAFT #84/#85/#86; HOLD titles retained; #101 left open draft.
- Exactly one disposable reset → CLEAN_BASELINE (`ambiguous_objects=none`); floor label applied; CLI 2.117.0 isolated; production never contacted.

## Where it HOLDs
Hosted qualify stopped at **00118** after intentional history-inject fail path:
- `repairSafety.gate.ok=true` and fingerprint after poison-cleanup matched V5 `888c7943…`
- Strict original-stdout poison verification rejected the live `supabase db query --output-format json` probe:
  - stderr: `Connecting to remote database...` → `unexpected_stderr`
  - stdout: CLI array wrapper `[{ "jsonb_build_object": { …envelope… } }]` — **not** exact `f3-poison-envelope-v1` object
- Therefore `repairAuthorized=false`; repair not spawned; no continuation; process exit 1; durable `--evidence-out` FILE written.

## Explicit non-actions (per absolute bans / hosted note)
- No second reset; no second hosted retry
- No silent reconstruction of wrapped CLI JSON for the strict validator
- No functional scope expansion beyond the 4 tip files (would require editing `f3-db-push-cli.mjs`)
- No force-push; no merge of #84/#85/#86/#96–#101; no project delete/pause
- No Daybreak Blue/Astra; no reseal from hosted

## Next authorized work (not this executor)
A future tip that yields **original stdout exactly equal to** the `f3-poison-envelope-v1` JSON (or equivalent non-wrapped path) without reconstruction — likely touching CLI query invocation outside today's 4-file allowlist — then one authorized reset+requal.
