# Phase E — PG 17.6 re-verify (catalog-v2 + independent reference)

**Verdict:** `READY_TO_FF`

## Pins
- Tip PR #97: `019321b4ce3f50aea0ecffd553df8d04f6753171`
- vs E `84938103…`: exactly 4 scripts
- Main `d83d13d4…` / PR #83 `a293f595…` unchanged
- PR #96 `d526b407…` reported untouched (not used as authority)

## Oracle
- Container `f3-reference-pg176` postgres:17.6 @ `127.0.0.1:55432`
- Seal DB: `f3_reference_catalog_v2_20260915`
- Schema: `f3-full-catalog-v2`
- Envelope digest: `eb58900b…` (10222 canonical bytes)
- Independent module sha: `de4ed3fd…`

## Seals (independent 17.6 ≡ tip embedded ≡ cloud-agent v2)
| file | hash |
|------|------|
| 00118 | `903235f58c9b1b1ed8217edf3c23a3eea570230c614e45aab712989618a773bf` |
| 00119 | `6dd0e4702cc824fa811fcac3d760583bdb810a04910b9d3d7bb098eaf0d2f6cd` |
| 00120 | `d94a0a091f5a177fb0bcc00a1e47945e771c8f33c89d9560d60784a3cc0d08c2` |
| 00121 | `aa0dcf787befffd5ef3a3ee6a2a7271c9fce31610b34d9000f698fe82c9b8f9c` |
| 00122 | `80c1b264c3b50dd3fbc5f7c21145fe96cd9cf099415d9ae7ce3210ed087219be` |
| 00123 | `f287f559f875d64dd1856ac312214c08ad0438ff502f812b80c67c19fe982baa` |

## Builder ≡ independent
All six structured compares: zero missing/extra/unequal keys.

## Tests
tests=121 pass=120 fail=0 skipped=1 exit_ok=True
Negative matrix observations: repairCalls=0 / dbPushCalls=0 where required.

## Isolation
No production / no disposable reset / credentials from local oracle env only.
