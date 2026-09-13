# S0-C — Migration Baseline + Replay Hygiene (2026-09-10)

**Status:** PASS — MIGRATION BASELINE + REPLAY CONTRACT FROZEN  
**Owner:** VillageClaq Chief  
**Production mutation:** ZERO  
**Historical migrations modified:** NO  
**Production migrations applied:** ZERO  

---

## 0. Frozen input refs

| Ref | SHA |
|-----|-----|
| Production main | `0559b758bc53df3ec8081e361ffd022c1f19be43` |
| PR #71 hard-freeze | `050be86c9df3455c66b27bb5853eb786228b4009` |
| S0-A | `97388b34037589a21eae66e3a5a1668f71e3bb55` |
| S0-B | `e1df73fd7536511fd2c062ab575eac9916fe86c7` |
| F0 | `99e17e2b4f4dc16753843f1e115312e70a8ae8ca` |
| F3 integration | `c7b4cd535d7125737eab2ec0fad27cae9432e8c3` |
| PR #69 | `a8cdeaa98e6bb9e3a6cccaf815aa4ae4441b59a7` |
| PR #70 | `0f258726c9328ee0204f7b5dee9efceebe7265b9` |

Machine-readable companion: `docs/evidence/S0_C_MIGRATION_MANIFEST_20260910.json`

---

## 1. Repository inventory (main)

- **115** files under `supabase/migrations/` at main `0559b758…`
- **Duplicate numeric IDs:** `00015` (two files), `00046` (part_a / part_b)
- Full inventory: evidence working `inventory.json` (filename, blob sha, flags)

### Classification summary (main tree)

| Class | Count (approx) | Meaning |
|-------|----------------:|---------|
| LEGACY-PRE-TRACKING | 73 | `00001`–`00071` not present as named rows in production `schema_migrations` |
| APPLIED-LIVE (semantic match) | 28 | Mapped to production history versions |
| REPO-ONLY / not in prod log | includes `00092`,`00097`–`00107`,`00112`,`00113` | Not in production applied list |
| CREATE-NOT-APPLY / DORMANT | `00106`,`00107` announcements; PR #70 timestamped schema | Must not be treated as pending prod apply |
| BRANCH-ONLY (F3 tip) | F3 timestamped files on `c7b4cd5…` | Not on main; not production |

---

## 2. Production history crosswalk

Production applied = **28** rows (S0-A). Semantically map to repo:

| Prod version | Prod name | Repo file | Match |
|--------------|-----------|-----------|-------|
| 20260417005634 | meeting_minutes_rls_fixes | `00072_…` | SEMANTIC/RENAMED |
| 20260417015620 | elections_anonymity_fix | `00073_…` | SEMANTIC/RENAMED |
| 20260417024813 | announcements_rls_fix | `00074_…` | SEMANTIC/RENAMED |
| 20260417105632 | security_hardening | `00075_…` | SEMANTIC/RENAMED |
| 20260417111410 | membership_insert_lockdown | `00076_…` | SEMANTIC/RENAMED |
| 20260417112143 | defense_in_depth | `00077_…` | SEMANTIC/RENAMED |
| 20260417135524 | gap_remediation | `00078_…` | SEMANTIC/RENAMED |
| 20260417171826 | standing_recalc_triggers | `00079_…` | SEMANTIC/RENAMED |
| 20260417192826 | 00080_configurable_standing_rules | `00080_…` | EXACT-ish name |
| … through … | 00081–00091, 00093–00096 | matching files | EXACT/SEMANTIC |
| 20260624232952 | apply_00108_… | `00108_…` | SEMANTIC |
| 20260624235754 | drop_duplicate_…00109 | `00109_…` | SEMANTIC |
| 20260625173802 | fix_archive_… | `00110_…` | SEMANTIC |
| 20260625181300 | harden_relief_branch_summary | `00111_…` | SEMANTIC |

**Notable:** production history **skips `00092`** (repo file is SELF-ABORTING / SUPERSEDED by `00098`).  
**Not in production log:** `00097`–`00107`, `00112`, `00113`, all F3 timestamped migrations, PR #70 `20260910120000_notification_policy_schema.sql`.

Do **not** interpret REPO-ONLY as “must apply to production.”

---

## 3. Extension / schema baseline (production)

| Extension | Production schema | Notes |
|-----------|-------------------|-------|
| `uuid-ossp` | `extensions` | CONFIRMED (S0-A) |
| `pgcrypto` | `extensions` | CONFIRMED (S0-A) |

### Migration references (main scan)

- `uuid_generate_v4()`: **00001**, **00002** (unqualified) — **SEARCH_PATH DEPENDENT** vs production `extensions` placement
- `gen_random_uuid()`: **28** files — works with pgcrypto in path / builtin
- `uuid_generate_v5` / `public.uuid_generate_*`: **none**
- `00001` issues `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` / `pgcrypto` **without** `WITH SCHEMA extensions` — differs from live layout

---

## 4. Blank-database full history replay

| Item | Value |
|------|-------|
| Environment | Disposable Docker `villageclaq-s0c-replay` · `postgres:17-alpine` |
| Stubs | `extensions` + uuid-ossp/pgcrypto; minimal `auth`/`storage` stubs (see `replay_stubs.sql`) |
| Command posture | Filename-sorted `psql` apply of all 115 main migrations |
| **Verdict** | **REPO FULL HISTORY REPLAY = FAIL** |

### First deterministic failure

- **File:** `00001_core_tables.sql`
- **Error:** `ERROR: role "authenticated" does not exist` (GRANT/ALTER OWNER ~line 269)
- **Deterministic:** YES on stock Postgres without Supabase roles

### Continue-pass blockers (after adding anon/authenticated/service_role; ON_ERROR_STOP=0)

14 failing files including (representative):

1. `00001` — already-exists noise on re-entry / role path
2. `00017` — missing `storage.foldername(text)` (Supabase storage helper)
3. `00026` — policy already exists / ordering drift
4. `00030` / `00057` — `unnest(uuid)` errors (array typing / SQL assumptions)
5. `00032` — index already exists
6. `00055` / `00095` / `00100` — stub `auth.users` missing phone/email_confirmed_at columns
7. `00061` — cannot change function parameter name without DROP
8. `00065` — missing columns / functions (subscription shape)
9. `00078` / `00112` — storage helpers missing
10. **`00092` — SELF-ABORTING:** `RAISE` “SUPERSEDED by 00098… do not apply”

**Conclusion:** historical directory is an **audit journal**, not a greenfield installer.

---

## 5. Approved baseline strategy

**Recommend: A + optionally B. Reject C (squash/rewrite) by default.**

### A — Production baseline + forward-only (PRIMARY)

1. Pin production baseline date/SHA + applied 28-row history + schema fingerprint.
2. Keep `supabase/migrations/00001`–`00113` as **immutable journal**.
3. All future **production** changes = new forward-only migrations (timestamped), each founder-authorized one-at-a-time.
4. Never “apply everything pending” against production.

### B — Disposable bootstrap artifact (OPTIONAL, later)

Generate a **separate** bootstrap schema dump / baseline pack for new empty envs (dev/QA), derived from production fingerprint — **without** fabricating `schema_migrations` rows on production.

### C — Rewrite/squash history

**Avoid** unless founder-authorized emergency. Would destroy auditability and contradict S0-C stop conditions.

---

## 6. New-environment replay contract

```
NEW EMPTY ENVIRONMENT
→ create roles anon/authenticated/service_role (or use Supabase platform)
→ INSTALL uuid-ossp + pgcrypto IN schema extensions
→ create required auth/storage helper stubs OR use Supabase local stack
→ APPLY APPROVED BASELINE PACK (B)  — not naive 00001…00113
→ APPLY FORWARD MIGRATIONS (post-baseline only)
→ RUN SCHEMA INVARIANT TESTS (fingerprint + critical helpers)
→ READY
```

Developers must not need undocumented dashboard SQL.

---

## 7. Production forward-migration contract

```
PRODUCTION CURRENT BASELINE (fingerprint + 28 history)
→ VERIFY PRECONDITIONS (loud RAISE on unexpected state)
→ APPLY EXACT ONE founder-authorized migration
→ VERIFY POSTCONDITIONS (grants/RLS/DEFINER/search_path/shape)
→ RECORD version in schema_migrations
→ CAPTURE evidence (SHAs/counts/booleans only)
```

No broad runner. No silent idempotent hiding of wrong state.

---

## 8. Migration security contract (Security PASS WITH FOLLOW-UP)

Daybreak Blue reviewed design-only pins (**PASS WITH FOLLOW-UP**). Baseline pins 1–10 accepted. **F1–F6 frozen before any S0 remediation migration is authored:**

1. DEFINER pinned `search_path` (prefer `''`)
2. Explicit minimal grants
3. No accidental PUBLIC/anon EXECUTE
4. RLS overlap checks on policy replace; FORCE where required
5. Same-tenant DB constraints where practical
6. Destructive DDL requires recovery design (S0-B proven)
7. Loud precondition fail
8. Postconditions
9. No PII in evidence
10. Production untouched by contract review

**F1.** Auth-before-disclosure/mutation in DEFINER bodies  
**F2.** After CREATE/REPLACE FUNCTION: `REVOKE ALL FROM PUBLIC, anon` then GRANT only intended roles  
**F3.** Multi-statement security migrations = single transaction  
**F4.** Write-path remediations use **active-membership** primitive (not status-blind helpers alone)  
**F5.** Client tables denying owner bypass: ENABLE + FORCE RLS  
**F6.** Evidence: SHAs/counts/booleans/redacted IDs only  

---

## 9. Schema fingerprint

| Item | Value |
|------|-------|
| Algorithm | MD5 of normalized sorted lines |
| Scope | public columns, constraints, function identity+security+config, policies, extensions |
| Production hash (2026-09-10 S0-C) | `0c39479e0b595fe5e1652169855abb96` |
| Customer rows | NOT included |

Future: `EXPECTED_BASELINE_HASH` vs `ACTUAL_LIVE_HASH` → MATCH/DRIFT.

---

## 10. F0 / F3 analysis (NO apply)

### F0 (`99e17e2b…`)

- Financial remediation track on integration branch; includes `20260906140228_financial_ledger_epochs_expand.sql`, `20260906140229_financial_payment_integrity.sql`, `20260908043912_standing_confirmed_basis_parity.sql` among others.
- **Production:** ledger epoch relations **NOT PRESENT** (S0-A).
- Future apply requires: production baseline + forward migrations only after S0 exit; **do not** replay entire historical 000xx chain on prod.

### F3-01…05 (`c7b4cd5…`) — semantic freeze preserved

Exact forward order on integration tip (after F0 financial prerequisites):

1. `20260908154824_f3_core_ledger_foundation.sql` (F3-01)
2. `20260908215831_f3_secure_posting_idempotency.sql` (F3-02)
3. `20260909022633_f3_projection_read_proof.sql` (F3-03)
4. `20260909054500_f3_correction_reversal.sql` (F3-04)
5. `20260910054713_f3_opening_cash.sql` (F3-05) — **UNAPPLIED** even on integration posture

**Compatibility:** F3 expects ledger/epoch/payment-integrity objects from F0 chain + `uuid`/`pgcrypto` in `extensions`. Prefer **bounded compatibility/precondition migration** over editing frozen F3 historical files if prod layout differs. **F3-06+ NOT STARTED.**

---

## 11. PR #70 placement

| Item | Status |
|------|--------|
| File | `supabase/migrations/20260910120000_notification_policy_schema.sql` |
| State | **CREATE-NOT-APPLY** · **REQUIRES REQUALIFICATION** · **NOT PRODUCTION AUTHORIZED** |
| Order | After S0 confirmed P0 remediation Cut(s) that fix helpers/queue/storage; after pure foundation #69 lineage; **before** any producer/cron wire |
| Dependencies | `is_group_member` / `has_group_permission` / `settings.manage` vocabulary; groups FK; IANA timezone |

---

## 12. Safety

- Production SQL writes: **ZERO**
- Production migration apply: **ZERO**
- Historical file rewrites: **NO**
- Disposable replay only

---

## 13. Next step

**S0 confirmed P0 remediation planning / Cut 1**  
Do **not** implement automatically.
