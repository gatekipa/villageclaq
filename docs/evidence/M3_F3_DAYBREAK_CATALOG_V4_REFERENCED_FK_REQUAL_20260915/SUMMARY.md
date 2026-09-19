# M3 F3 Daybreak Catalog-V4 referenced-side FK requal 20260915

**Verdict: FILE-BASED RUNNER QUALIFICATION PASS — STUB/LIVE-PIN FLOOR LIMITATION**

## Pins
- Main `d83d13d4…` / PR #83 `a293f595…`
- E3 `a0c71ad…` / F3 prior `e61894fa…` / F4 functional `26d91b1a4fa636346098efd33c36df7b466586ae`
- PR #99 tip `50b3d884…` (vs E3: exactly 4 files) — left open draft; #96–#98 untouched

## Local 17.6
- Schema `f3-full-catalog-v4`; primary≡independent≡tip≡cloud V4 for all six
- Trigger universe counts match claimed; referenced-side profiles/groups/organizations present; per-trigger tgdeferrable/tginitdeferred present (not constraint-level substitutes)
- Envelope `eb58900b…`; module sha `d9655456…`; closure_complete; d692/d802 supersession recorded
- npm run test:f3-db-push: 123 / pass 122 / fail 0 / skipped 1

## Hosted disposable
- Ref `jkorwnwwmdeflfntxntl` / exactly one reset → CLEAN_BASELINE / ambiguous_objects=none
- Floor: `DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT`
- Process exit **0**; durable FILE `--evidence-out`
- All six: push_status=1, repair_status=0, POST_COMMIT_HISTORY_FAILURE, exact fingerprint equality

## Supersession
Supersedes `M3_F3_DAYBREAK_CATALOG_V3_INTERNAL_TRIGGER_REQUAL_20260915` (prior dirs untouched). V3 00123 d692 and d802 both superseded by V4 `a1eb6ba2…`.

## Absolute bans honored
Production never contacted. No force-push. No merge of #84/#85/#86/#96/#97/#98/#99. No second hosted retry. No reseal from hosted.

Captured: 09/16/2026, 1:03:08 AM ET
