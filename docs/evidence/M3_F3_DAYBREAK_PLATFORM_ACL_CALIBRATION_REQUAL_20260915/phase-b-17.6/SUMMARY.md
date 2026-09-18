# Phase B — PG 17.6 re-verify (platform ACL)

**Verdict:** `READY_TO_FF`

## Pins
- Tip PR #96: `d526b407992fc2a806f2b7ba7170af335a118630`
- vs `2fcc651`: exactly 3 scripts (scripts/lib/f3-db-push-repair-safety-gate.mjs, scripts/qualify-f3-db-push-disposable.mjs, scripts/test-f3-db-push-harness.mjs)

## Oracle
- Container `f3-reference-pg176` postgres:17.6 @ `127.0.0.1:55432`
- Seal DB: `f3_reference_platform_seal_20260915`
- Host 17.11 :5432 avoided
- Platform ACL envelope digest: `eb58900b492b95371decfdab86b3786afc2c8089c6b0a117497f9e0b22c41a2a`

## Seals (independent 17.6 recompute ≡ tip embedded)
| file | hash |
|------|------|
| 00118 | `72af66999f3a53a870cd1a5d0ed99a2acb7f510c69bfe16204b9fe0f217f757f` |
| 00119 | `af633e8c0c2cd5aa4df743960e03e5d9d2e17c36907c76cb9ee8ee2dfe8a2ebc` |
| 00120 | `b1b3b3c3ab4163378c8dfdbeb1da1421a5a1480b5a457424da9bc4a885d1027c` |
| 00121 | `db68839cc5f61ab22a84a21965af4e90a41e7b4139a056c371aa0347eb4e04ca` |
| 00122 | `d8b2d0316e555339bcd95e944fd23e5c7686f16fa34d1d4c4691d610b1dc7659` |
| 00123 | `07e984115ffc24f4e9e0f0d5d1d7f8c903c81064312e5c0b498e367ca11a0854` |

00118 equals `72af6699…` after platform defaults — independently recomputed (not assignment copy).

## Builder ≡ reference
All six equal=true.

## Tests
tests=118 pass=117 fail=0 skipped=1 exit_ok=True

## Isolation
No production / no disposable reset / credentials from local oracle env only.
