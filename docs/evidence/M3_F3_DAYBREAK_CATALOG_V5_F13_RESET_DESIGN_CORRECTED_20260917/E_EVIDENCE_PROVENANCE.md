# Finding E — evidence provenance

**Closed in this package. No transformation provenance is invented.**

## Finalized sanitized F9 reset-result

| Field | Value |
|-------|-------|
| Source commit | `f5727733a036536c0374d93570f61e80a127d428` |
| Repo-relative path | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F9_EVENT_DURABLE_REQUAL_20260916/hosted/reset/reset-result.json` |
| SHA-256 | `dddf20e1c0762515a4132c77550f96665d2c56476780a9abc65f03a92bb127b6` |
| Bytes | `2749` |
| Copy in this package | `provenance/F9-reset-result.sanitized.json` |

The copy is byte-for-byte identical to the source blob (same digest, `cmp` identical). The source artifact already uses `[SANITIZED_ABS_PATH]` in `stderr_tail`.

## What is not used

| Artifact | Digest | Why unused here |
|----------|--------|-----------------|
| F12 proposal `historical-f8-f9/F9-reset-result.json` | `eb2c6fac88d37a0a1be67d5c3c55ca6a08e3442f5858dc3577bee8f95bc46d05` | Observably not the finalized sanitized bytes. Absolute executor paths appear in `stderr_tail`. Left in the unchanged F12 package. |
| F8 reset-result bytes | `5b1c174a99c95e43802e38f36ea9e7db738a2bdf1a06decec5d21d05f7da04d0` | Also contains absolute executor paths. Cited, not recopied. |

F8 citation (no copy):

- Source commit: `080dd6adc79931bbcff25893d407aecf91bc7c14`
- Repo-relative path: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F8_LOCALPROOF_PERREPAIR_REQUAL_20260916/hosted/reset/reset-result.json`
- SHA-256: `5b1c174a99c95e43802e38f36ea9e7db738a2bdf1a06decec5d21d05f7da04d0`

This package does not claim who altered the F12 F9 copy or by what tool. Only the byte inequality versus the finalized sanitized artifact is stated.

## Historical complete argv

**CANNOT CONFIRM.**

Searched F8/F9 hosted reset artifacts. `reset-result.json` has status/stdout/stderr tails. `hosted/STATUS.json` records a poison-probe argv, not the qualification-reset invocation argv. No authentic complete reset argv artifact was found. The field stays `CANNOT CONFIRM`.

## Path disclosure

New package files must not contain workspace absolute paths. Offline test `F13-E02` walks this directory and fails on those patterns.
