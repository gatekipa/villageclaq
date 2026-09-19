# PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE

**Status:** PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE  
**Audience:** Chief / Daybreak (review later). LOCAL qualification-reset candidate staging.  
**This overnight executor did not obtain credentials, probe disposable, contact production, contact Daybreak/Astra, or execute hosted requalification.**

## Wipe flag (unchanged rejection)

`--wipe-to-baseline` remains unconditionally rejected (`F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`). Do not enable, weaken, or bypass.

## Bound identities (fill / confirm at hosted gate)

| Field | Value |
|------|-------|
| F13 functional tip | `51cc864d1efbefc1398ad3fd1895360c95474a57` |
| Design ACCEPT tip | `a117d06fb202696944ae423d77336db0a48a8a13` |
| F12 functional preserved | `1ec0e4da782ed7715a543be23f79bc0f10a28af2` |
| Local closure digest | `16e4757840aec5f4fb44504fbd33e8480de169553f9a1ccfb180dbde051cb66d` |
| Scope SQL identity | `a0d09868aff25859521ae9931d14c9faa4562da11e5f872d7be8e8e1195071eb` |
| History keys | PREASSIGNED 20260913173000–005 + authenticated names (six rows) |

## Proposed hosted procedure (NOT RUN)

1. Confirm disposable target only; refuse production immediately.
2. Capture inventory via `QUALIFICATION_RESET_INVENTORY_CAPTURE_SQL` / `INVENTORY_CAPTURE_SQL` (no hardcoded empty observation).
3. Bind founder authorization artifact (target/candidate/closure/scope/budget; `secondReset=false`). Flag alone is not auth.
4. If `alreadyClean` → `CLEAN_BASELINE` no mutation. If leftovers → require `eligible===true` then gated T0–T7 `psql -f` of finite-allowlist RESTRICT SQL.
5. Extras / history mismatch / CASCADE / wipe → HOLD or fail closed; no automatic replay on UNCERTAIN_COMMIT.
6. Exactly one constrained reset budget; no second reset; no wipe bypass.

## Commands (placeholders — DO NOT EXECUTE)

```bash
# DO NOT: --wipe-to-baseline
# DO NOT run against production
# node scripts/qualify-f3-db-push-disposable.mjs --qualification-reset --founder-authorization-artifact=docs/.../FOUNDER_AUTH.json
```

Offline local throwaway proof recorded separately under `local-pg-proof/` (fixtures only; not hosted-equivalent).

**Overall remains: DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN**
