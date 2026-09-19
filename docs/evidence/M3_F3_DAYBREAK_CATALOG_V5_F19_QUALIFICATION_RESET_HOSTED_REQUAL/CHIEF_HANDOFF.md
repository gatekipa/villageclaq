# CHIEF HANDOFF — F19 hosted qualification-reset

**Overall: DAYBREAK HOLD — HOSTED REQUALIFICATION NOT COMPLETE**

This package is **HOSTED RESET HOLD — inventory-only, no mutation**.
It is **not** a hosted requalification PASS. Do not treat this commit as hosted requal success.

| Slot | Status |
| --- | --- |
| Hosted qualification-reset | **HOLD** `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY` — inventory captured, mutation=false |
| Qual-from-00118 | **NOT RUN** |
| Local F18 / F19 packages | **INHERITED** — do not re-copy local suites |
| Production (`llbnliixczcqfftxpsmb`) | Never contacted |
| Disposable target | `jkorwnwwmdeflfntxntl` only |
| Second reset | **Not run** |
| F3-06 under this auth | **Not run** |

## Verdict

- Code: **`F13_UNEXPECTED_OBJECT_OR_DEPENDENCY`**
- Reset outcome: HOLD after inventory; `executed=false`, `committed=false`, `mutation=false`
- Spies: `planCalls=1`, `validateCalls=1`, `captureCalls=1`, `transportCalls=0`, `applyCalls=0`, `mutateAttempted=0`
- Wipe remains `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`

## Why reset stopped

Inventory on the disposable target included objects and dependency identities outside the approved reset allowlist. Reset refused rather than mutate.

### Unexpected function-like objects (~188)

Almost all unexpected function-like objects are **btree_gist / public `gbt_*` helpers** (plus related `gbtreekey*` I/O and distance operators). Extension `btree_gist` is allowlisted; **member functions are not**.

### Unexpected FK identities (6)

- `group_positions_group_id_fkey`
- `groups_organization_id_fkey`
- `memberships_user_id_fkey`
- `notification_policy_occurrences_superseded_by_fkey`
- `position_assignments_position_id_fkey`
- `position_permissions_position_id_fkey`

### History present (no F3-06)

Versions **20260913173000–05** are present:

- `20260913173000` `f3_bounded_financial_epoch_foundation`
- `20260913173001` `f3_01_core_ledger_foundation`
- `20260913173002` `f3_02_secure_posting_idempotency`
- `20260913173003` `f3_03_projection_read_proof`
- `20260913173004` `f3_04_correction_reversal`
- `20260913173005` `f3_05_opening_cash_command`

No F3-06 under this authorization. No second reset.

## Pins

| Role | SHA |
| --- | --- |
| Hosted run HEAD / functional tip (frozen; scripts unchanged) | `dfbeb11b49f7e9b061a4c700e0335d125ac669e2` |
| Prior evidence tip (packaging start) | `20b4b340b49bccfc96f23333c731bac54056ea9c` |
| Runtime closure | `8d4885d6148e7dfca99e4abdb62db6be27479731cc33e680cc36437347b6fdfe` |
| Scope/SQL identity | `8b91a29cd3178e40d2ef5d79b6c585c1f7e2e615bd3967935546b68f2f9f8a0e` |
| CLI pin | supabase 2.117.0 |

Floor (verbatim): **DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT**

## Prior pre-DB attempt (archived)

`F13_FOUNDER_AUTH_STALE` is archived as `hosted/qualification-reset/qualify-result.STALE_AUTH_HOLD.json`. That attempt did not contact the disposable DB (`hostedDisposableContacted=false`, `dbAccess=false`, `qualificationResetCalls=0`) and did not consume the mutation budget.

After functional-tip checkout, founder auth binding matched and the constrained reset captured inventory, then HOLD.

## Evidence paths

Package root: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F19_QUALIFICATION_RESET_HOSTED_REQUAL/`

- `CHIEF_HANDOFF.md` (this file)
- `EXECUTION_REPORT.json`
- `HOLD_SUMMARY.json`
- `evidence-index.json` + `evidence-index.sha256` (outer; written last)
- `hosted/qualification-reset/FOUNDER_AUTH.json`
- `hosted/qualification-reset/qualify-result.json` (inventory HOLD)
- `hosted/qualification-reset/qualify-result.json.meta.json`
- `hosted/qualification-reset/qualify-result.STALE_AUTH_HOLD.json` (prior stale-auth HOLD)
- `hosted/qualification-reset/qualify-result.STALE_AUTH_HOLD.json.meta.json`
- `hosted/qualification-reset/evidence-index.json` + `evidence-index.sha256`
- `hosted/qualification-reset/executable-manifest.json`

Local F18/F19 suites remain in their existing packages and are **INHERITED**. They were not re-copied here.

`EXECUTION_REPORT.json` packaging note: uploaded executor record contained nonsemantic VM absolute paths under `paths`; those were replaced with `[SANITIZED_ABS_PATH]` before the outer index. Verdict, spies, object/dependency/history facts, and target refs are unchanged.

## Waiting on founder

Reset scope / allowlist decision required before any further hosted attempt:

1. Whether btree_gist **member functions** (`public.gbt_*` / `gbtreekey*`) should be treated as implied by the allowlisted extension, or remain unexpected.
2. Whether the six unexpected FK identities above are in-scope for reset or remain blocking.
3. Whether history 20260913173000–05 on the disposable target is accepted as the documented fixture floor (no wipe; no second reset under this auth).

Until that decision: **no second reset**, **no qual-from-00118**, **no script/lib changes**, **no F3-06**, **no production contact**.
