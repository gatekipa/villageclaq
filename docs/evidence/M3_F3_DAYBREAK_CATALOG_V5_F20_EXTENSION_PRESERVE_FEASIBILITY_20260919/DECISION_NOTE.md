# Decision note — extension-preserving qualification reset (offline feasibility)

**Status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN

**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

**Founder direction:** Part A (extension-removal + catalog-privilege exception) **deferred**. No catalog-privilege exception authorized. F20 `DESIGN_HOLD` / `F20_EXTENSION_MEMBERSHIP_SERIALIZATION_UNSUPPORTED` **preserved**. No implementation under this task.

**Pins**

| Role | SHA |
|------|-----|
| Design head (start) | `cc0ecacb55941ab038dd52095bd1be814569d1b0` |
| Accepted F19 functional | `dfbeb11b49f7e9b061a4c700e0335d125ac669e2` |
| Hosted HOLD ancestor | `35b5be82acf01d11dd9f6578e8da7f384d8f925d` |
| Evidence before hosted | `20b4b340b49bccfc96f23333c731bac54056ea9c` |

## Verdict

### **NOT FEASIBLE UNDER THE CURRENT CONTRACT**

Retaining `btree_gist` and its authenticated members through the constrained reset **conflicts with approved reset success / eligibility checks as written**. A revised baseline/T3/T6/allowlist policy could be proposed later for independent review; that is a **contract change**, not a silent reinterpretation of today’s HOLD/CLEAN_BASELINE.

Part B (six `historicalNoticeOnly` FKs → 43 dependencies) remains as specified in the F20 design package and is **not** implemented or re-verified here.

---

## 1. Why the existing reset removes `btree_gist`

**Source-supported**

- `FINITE_OBJECT_ALLOWLIST` entry `ext.btree_gist` (`scripts/lib/f3-db-push-qualification-reset-design.mjs`):
  - `provenance`: `00118_f3_bounded_financial_epoch_foundation.sql` @ F12 tip `1ec0e4da…` (`P118`)
  - `intendedAction`: `DROP EXTENSION btree_gist RESTRICT` (skip if absent; BLOCK if dependents remain)
- Emitter (`scripts/lib/f3-db-push-qualification-reset.mjs`):
  - Mutate path emits `DROP EXTENSION IF EXISTS btree_gist RESTRICT`
  - **T6 final:** `presenceProbe(extension)` must be NULL or `F13_FINAL_BASELINE_FAILED: btree_gist still present`
- Success / already-clean verdict constants: `F13_RESET_SUCCESS_VERDICT` / `F13_RESET_ALREADY_CLEAN_VERDICT` = `CLEAN_BASELINE`

**Oracle / baseline dependency on absence**

- Post-reset “clean for requal-from-00118” is defined as **CLEAN_BASELINE** after allowlisted drops (including the extension).
- Broader classifier `classifyInventory` (`f3-db-push-inventory.mjs`): any public function name not in `FAILED_FLOOR_PUBLIC_FUNCTION_NAMES` (and not `unnest`) is an **`extraFunction`** → blocks `cleanBaseline` / yields HOLD ambiguity.
- Extension member routines (`gbt_*`, `*_dist`, …) are ordinary `public` functions in discovery; they are **not** failed-floor names → they make CLEAN_BASELINE false while present.
- Pre-apply `validateObjectAllowlist`: identities not on `FINITE_OBJECT_ALLOWLIST` are unexpected → hosted HOLD `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY` (188 functions) under today’s tip.

**Not a wipe-oracle requirement:** wipe remains rejected (`F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`). Removal is a **qualification-reset allowlist** choice tied to treating 00118-created extension state as F3 leftover.

---

## 2. Migration 00118 and qualification with extension already installed

**Source-supported**

- `00118_f3_bounded_financial_epoch_foundation.sql` line ~73: `CREATE EXTENSION IF NOT EXISTS btree_gist;`
- Same migration creates `EXCLUDE USING gist (...)` on `public.financial_ledger_epochs` (requires gist opclasses from the extension).

**Implication (source):** If the extension is already installed, `CREATE EXTENSION IF NOT EXISTS` is a no-op; the EXCLUDE constraint can still be created. Retention does **not**, by itself, contradict 00118’s install statement.

**Requires future local PostgreSQL verification (not proven here):**

- Full `--no-wipe --prep-floor --sequence-f3 --floor-mode=stub-live-pin` behavior when `btree_gist` pre-exists (expected failures/repairs, fingerprint gates, ACL probes).
- Whether any harness assertion assumes extension was absent immediately before 00118 apply (none found in the stub-live-pin floor module via `btree_gist` search; still not a substitute for executing the sequence).

**Security / qualification claim:** No source line was found that claims “qualification requires btree_gist absent after reset” except the reset contract itself (allowlist + T6 + CLEAN_BASELINE). Retention would change the **reset success claim**, not an independent 00118 security invariant found in migration SQL.

---

## 3. Drop / cleanup operations that can affect extension members

**Source-supported — operations that remove members**

| Operation | Location | Effect on members |
|-----------|----------|-------------------|
| `DROP EXTENSION … RESTRICT` | Allowlist + emitter mutate | Removes authenticated extension members (`deptype='e'`) |
| `DROP EXTENSION … CASCADE` | Explicitly rejected in design (`validateNoBroadCascade`) | Forbidden |

**Source-supported — operations that do *not* individually drop members today**

- No `gbt_*` / `*_dist` rows on `FINITE_OBJECT_ALLOWLIST` as `DROP FUNCTION`.
- Table/type/schema drops in the allowlist do not target extension member routines.

**Source-supported — checks that still fail while members remain (even if DROP EXTENSION is removed)**

1. **`validateObjectAllowlist`** — non-allowlisted function identities → `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY`.
2. **T3 revalidate** — any `public`/`financial_*` function whose canonical identity is not in allowlisted **function** identities → unexpected (emitter builds `functionIdentities` only from `kind === "function"` allowlist rows; extension members are absent from that list).
3. **T6 final** — if `btree_gist` remains on the allowlist as a drop target, final requires it absent.
4. **`classifyInventory` / `evaluateQualificationResetCleanBaseline`** — member function names count as `extraFunctions` → not CLEAN_BASELINE.

**Conclusion:** Removing only the `DROP EXTENSION` allowlist row is **insufficient**. Preservation requires coordinated recognition in allowlist validation, T3, T6, and CLEAN_BASELINE policy.

---

## 4. Recognition / preservation checks (if a revised contract were later authorized)

Keep F20 typed membership requirements (kind, canonical identity, classid/objid/objsubid, refclassid=`pg_extension`, extension OID+name, `deptype='e'`). Names/prefixes remain insufficient.

**Retained hosted 188-function ownership remains `CANNOT CONFIRM`** (no `pg_depend` in committed hosted capture). Synthetic or local fixtures do not authenticate those hosted objects.

This assessment does **not** authorize enriched capture or hosted contact.

---

## 5. CLEAN_BASELINE contract impact (explicit)

**Yes — extension preservation changes the CLEAN_BASELINE contract.**

Under the current contract:

- Reset success / already-clean ≡ `CLEAN_BASELINE`.
- `CLEAN_BASELINE` requires `extraFunctions.length === 0` (among other predicates).
- Authenticated `btree_gist` members in `public` are `extraFunctions` today.
- T6 requires allowlisted extension identity absent.

Therefore one **must not** relabel today’s hosted HOLD (or a post-reset DB that still has `btree_gist` + members) as CLEAN_BASELINE without an independently reviewed baseline policy revision (e.g. “CLEAN_BASELINE_WITH_APPROVED_EXTENSION_RESIDUALS” or scoped predicates that exempt only typed `deptype='e'` members of an allowlisted preserved extension).

Silent reinterpretation would weaken approved assertions — **rejected by this note**.

---

## 6. Part B

Accepted six historical FK tuples and **43 = 31 + 12** dependency design from F20 design package remain on record. **No Part B implementation or verification cycle** in this task.

---

## If a revised contract were later authorized — proposed runtime scope (not authorized now)

| File | Policy change (preview only) |
|------|------------------------------|
| `f3-db-push-qualification-reset-design.mjs` | Remove or reclassify `ext.btree_gist` from **destructive** allowlist to **preserve**; membership recognition helpers; do not add individual DROP FUNCTION rows for members; Part B FK tuples when separately authorized |
| `f3-db-push-inventory.mjs` | Typed membership fields in discovery; CLEAN_BASELINE revision proposal (new named verdict or explicit residual predicates) |
| `f3-db-push-qualification-reset.mjs` | T3 exempt only authenticated members; T6 must not require extension absence; no DROP EXTENSION for preserved ext |
| Design/reset tests + `prove-f3-qualification-reset-local.mjs` | Focused cases below |

---

## Focused tests needed (future — not run here)

1. Typed valid membership → residual allowed; forged/missing/wrong-OID → BLOCK.  
2. Preserve path: no `DROP EXTENSION`; T6 extension still present; members remain.  
3. Unauthenticated `gbt_*` name-only → still BLOCK.  
4. Qual-from-00118 with preinstalled extension (local PG): apply/sequence assertions.  
5. Six exact FK tuples / altered / unrelated (with Part B impl).  
6. Wipe still rejected; no CASCADE.

**Local PostgreSQL:** Available on this environment historically, but **not used** in this docs-only task. Absence of a run here is **not** proof about locking mechanisms (locking is out of scope; Part A deferred).

---

## Unavoidable tradeoff / smallest founder decision

| Option | Meaning |
|--------|---------|
| **A. Keep current contract** | Continue fail-closed on non-allowlisted public functions / require extension removal for CLEAN_BASELINE. Hosted HOLD stands. (Part A remains deferred.) |
| **B. Authorize a revised baseline + preserve policy** (new ticket) | Explicitly redefine post-reset success to allow typed `btree_gist` residuals; change T3/T6/allowlist accordingly; then local implementation + QA. Does **not** reopen catalog-privilege / removal serialization. |
| **C. Authorize Part B only** | Land the six `historicalNoticeOnly` FKs under current removal contract (still drops extension). Does not clear the 188-function HOLD without Part A or Option B. |

---

## Separation of claims

| Claim | Basis |
|-------|--------|
| Current contract requires extension absence for reset success | Source (allowlist, T6, CLEAN_BASELINE / extraFunctions, validateObjectAllowlist, T3) |
| 00118 tolerates pre-existing extension at SQL level | Source (`CREATE EXTENSION IF NOT EXISTS`) |
| Full hosted/qual sequence compatibility with retention | **Requires future local PG verification** |
| Hosted 188 ownership | **CANNOT CONFIRM** (unchanged) |

## Not authorized by this note

Implementation, hosted contact, enriched capture, reset, SQL mutation, qualification, migration, merge, deployment, F3-06, catalog privileges, Part A locking work, suite reruns, Daybreak/Astra contact.
