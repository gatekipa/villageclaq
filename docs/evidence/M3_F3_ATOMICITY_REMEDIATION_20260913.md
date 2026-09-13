# M3 F3 Transaction Atomicity Remediation — 2026-09-13

> **SUPERSESSION (2026-09-13 external-ledger remediation):** this document remains
> the SQL **pre-commit** rollback proof (14/14). It is **not** CLI-equivalent and
> is **not** the post-COMMIT / pre-external-history proof. Later evidence
> `M3_F3_EXTERNAL_LEDGER_REMEDIATION_20260913.md` supersedes any reading of the
> disposable `00118`…`00123` label ledger as the production runner or history key.
> Production S0/M2 history versions are generated timestamps + snake_case names.

**VERDICT: ATOMICITY REMEDIATION PASS** (SQL pre-commit rollback only)

**DO NOT MERGE.**  
**DO NOT APPLY 00118+ TO PRODUCTION.**  
**NO F3-06 UI. NO PRODUCTION FINANCIAL WRITES. NO M4.**  
**FCG-1 IS NOT CLOSED.**  
**NO CONTACT WITH ASTRA OR DAYBREAK.**

Draft PR: https://github.com/gatekipa/villageclaq/pull/84  
Branch: `feat/m3-f3-01-05-forward-foundation-9b17` (additive commits only; draft/unmerged)

## Supersession (explicit)

This evidence tip **supersedes**:

| Pin | Old SHA | Status |
|-----|---------|--------|
| Old functional | `bb0c918201f4114303404a3498f312d9679c36cd` | SUPERSEDED |
| Old evidence tip | `a983157cbc3507f925f5889d23ac2a1be90e2a2d` | SUPERSEDED |
| Premature-COMMIT 00118 digest | `e382fb033cf7f51a321cb2c84590d9375b49ec49d400f763ea4e08fe9d9d6697` | SUPERSEDED |
| Premature-COMMIT 00119 digest | `be20b1197ea5e971888357f05127ee8e4358af69ef6d63169b4c0fd560ad6269` | SUPERSEDED |
| Premature-COMMIT 00120 digest | `de8359d1d289933cf4d4f7d5970b2126e4e49373fe35b8fdfc7bbf89964bd499` | SUPERSEDED |
| Premature-COMMIT 00121 digest | `620f807c6119cc1ea14ef586b0b624350410bb513ef2c87fa96ec32bd0b29195` | SUPERSEDED |
| Premature-COMMIT 00122 digest | `ea5daf5031170badc407aecbbc71af51b16b6dd38d08aee9caca7ec9f259b2e8` | SUPERSEDED |
| Premature-COMMIT 00123 digest | `f710844800794a5afaa9ae8adb7a143d14b0abc10d458b33947c87bbacae3191` | SUPERSEDED |

**NEW functional SHA:** `fc3d4ff8cb59ad09abdc07033cbfd20cec75e585`  
Evidence tip is the docs-only commit after that SHA.

The premature-COMMIT versions left HGP postconditions, owner pinning, grants/revokes, role-switch verification, and RESET ROLE **outside** the DDL transaction. A security-tail failure could not roll back already-committed F3 objects. That HOLD is closed on this draft only.

## Pins

| Pin | Value |
|-----|-------|
| Base main | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| Planning PR #83 (unchanged) | `a293f5958b31548ccec7591b653eff2857ae9a90` |
| Generated SQL header historical planning cite | `a178068384290b37ec6c17b02428b399d52ddd10` (left as-is; not a PR #83 edit) |
| **Functional SHA** | `fc3d4ff8cb59ad09abdc07033cbfd20cec75e585` |
| Superseded functional | `bb0c918201f4114303404a3498f312d9679c36cd` |
| Superseded evidence tip | `a983157cbc3507f925f5889d23ac2a1be90e2a2d` |
| Prod mutations | none |

**PR #83 status:** unchanged. Astra-approved UX criteria were not edited. No pin-only correction was applied to PR #83.

## Defect and fix

Root cause: `scripts/generate-f3-forward-migrations.py` concatenated the security tail after an oracle body that already contained `COMMIT`.

Corrected generator:

1. Extracts/reads frozen oracles from `scripts/oracles/f3-forward/` (or `/tmp/f3-oracle/migrations`)
2. Strips the trailing top-level `COMMIT`
3. Appends HGP postconditions, owner pin, exact grants/revokes, `SET ROLE postgres`, ACL enforcement, `RESET ROLE`
4. Emits the **sole** final top-level `COMMIT`

00118–00123 were regenerated from that generator. No hand-edit of generated SQL. Financial-event/posting/recognition/RPC/RLS/ACL outcomes were not changed — transaction boundaries only.

Recognition allowlist remains EXACTLY `["manual_income"]`.

## Transaction-boundary matrix

Exactly one effective top-level `BEGIN;` and one final top-level `COMMIT;` per file. Security tail is strictly before `COMMIT`. Nothing after `COMMIT`.

| File | BEGIN | HGP post | RESET ROLE | COMMIT | After COMMIT |
|------|------:|---------:|-----------:|-------:|--------------|
| `00118_f3_bounded_financial_epoch_foundation.sql` | 71 | 214 | 281 | 283 | none |
| `00119_f3_01_core_ledger_foundation.sql` | 72 | 772 | 839 | 841 | none |
| `00120_f3_02_secure_posting_idempotency.sql` | 65 | 501 | 568 | 570 | none |
| `00121_f3_03_projection_read_proof.sql` | 65 | 721 | 788 | 790 | none |
| `00122_f3_04_correction_reversal.sql` | 64 | 641 | 708 | 710 | none |
| `00123_f3_05_opening_cash_command.sql` | 64 | 325 | 392 | 394 | none |

## New migration SHA-256 digests

| File | NEW SHA-256 | Bytes |
|------|-------------|------:|
| `00118_f3_bounded_financial_epoch_foundation.sql` | `517774fd883ecc8c8ba7d2e287c7245a1289b21623c839f594b0801611968f3c` | 12150 |
| `00119_f3_01_core_ledger_foundation.sql` | `9b09a733ed848e2a88a894db0815bd0f33f86335b58f7c9cd58845b6607d785d` | 34878 |
| `00120_f3_02_secure_posting_idempotency.sql` | `4b870418ea15160a7aec0e6df707d9c8a3afc435f2d8bd1c861e0af7c47eb505` | 32318 |
| `00121_f3_03_projection_read_proof.sql` | `568ae0b15b1b6e6c0a7effd9e9b5644a294cc22d76dbbf0e6714a28888825cf5` | 35291 |
| `00122_f3_04_correction_reversal.sql` | `fd2c6e8729d1c7983421804b5f028edd16170c9f9056c8db2f3994f4dff8bdf9` | 48436 |
| `00123_f3_05_opening_cash_command.sql` | `848b7cbe7e4e20e2e284d88f9954be0be8ffdfe4fc6d7c649e536d0c09aab699` | 19028 |

## Failure-atomicity (executed, not inferred)

Suite: `scripts/test-financial-f3-migration-atomicity.mjs` — **14/14 PASS**

Apply path: the same disposable `psql -f` used by `applyForwardMigration`, plus `supabase_migrations.schema_migrations` (Cut 2/3 disposable ledger shape). Version is recorded **only after** a successful file apply. Injected copies also `INSERT` the target version inside the transaction before `RAISE EXCEPTION`, then prove that row is gone after rollback.

### 00118 (empty predecessor)

Each inject is after substantive DDL and before final `COMMIT`. Command fails with `F3_ATOMICITY_INJECT:<site>`. After failure:

- `financial_private` / `financial_core` absent
- zero F3 relations / functions / policies / types
- ledger does not contain `00118`
- session identity remains `ubuntu:ubuntu`
- fingerprint equals pre-attempt empty-F3 fingerprint
- clean `00118` then applies without object-collision and records `00118`

| Site | Fail | Residual F3 objects | Ledger advanced | Session | Clean retry |
|------|------|---------------------|-----------------|---------|-------------|
| `hgp_post` | yes | 0 | no | ubuntu | yes |
| `owner_pin` | yes | 0 | no | ubuntu | yes |
| `grant_revoke` | yes | 0 | no | ubuntu | yes |
| `role_check` | yes | 0 | no | ubuntu | yes |

### 00119–00123

Legitimate preceding migrations applied and recorded first. Pre-attempt fingerprint captured (schema + function-owner + ACL + policy + ledger). Target inject in security tail. After failure: target markers absent, fingerprint identical to pre-attempt, failed version not in ledger, session ubuntu, clean target retries without collision.

| Target | Site | Fail | Pre-fingerprint unchanged | Failed version recorded | Clean retry |
|--------|------|------|---------------------------|-------------------------|-------------|
| 00119 | `hgp_post` | yes | yes | no | yes |
| 00120 | `hgp_post` | yes | yes | no | yes |
| 00120 | `grant_revoke` | yes | yes | no | yes |
| 00120 | `role_check` | yes | yes | no | yes |
| 00121 | `hgp_post` | yes | yes | no | yes |
| 00122 | `hgp_post` | yes | yes | no | yes |
| 00123 | `hgp_post` | yes | yes | no | yes |

Successful full-chain apply records ledger `00118`…`00123` and leaves session `ubuntu`. After success: F3 DEFINER owner `postgres`, `search_path=""`, RLS on `financial_%` tables, authenticated-only command RPC execute, HGP pin unchanged.

## Fresh disposable qualification (do not reuse old counts)

Floor: stub current-main objects + live Cut 2 HGP/enqueue/queue pins + real `00117` + regenerated `00118+` (regression). Individual F3 DB suites use stub + live HGP + `00118+`. **Not** clean greenfield `00001`–`00117`.

| Suite | Result |
|-------|--------|
| Failure-atomicity + retry | **14/14 PASS** |
| Recognition direct | **40/40 PASS** |
| F3-01 DB | **43/43 PASS** |
| F3-02 DB | **159/159 PASS** |
| F3-02 Astra | **169/169 PASS** |
| F3-03 DB | **25/25 PASS** |
| F3-03 Astra | **80/80 PASS** |
| F3-04 DB | **23/23 PASS** |
| F3-04 Astra | **170/170 PASS** |
| F3-05 DB | **31/31 PASS** |
| F3-05 Astra | **118/118 PASS** |
| Post-S0 regression | **14/14 PASS** |
| Combined `npm run test:f3` | **886/886 PASS** |
| M2 static security | **9/9 PASS** |
| Cut 1 static | **11/11 PASS** |
| Cut 2 non-regression | **20/20 PASS** |
| Cut 3 storage buckets | **11/11 PASS** |
| `./node_modules/.bin/tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** (dummy URL `https://example.invalid.supabase.local` — not production) |

PostgreSQL 17.11 (Ubuntu 17.11-1.pgdg24.04+2). Production URL not used.

## Confirmations

- Semantics / UX unchanged: no posting, correction, opening, recognition, currency, or RLS rule edits
- Recognition allowlist EXACTLY `["manual_income"]`
- PR #83 unchanged
- Production unchanged: no apply / SQL / financial writes / storage mutation / queue insert / send / deploy / merge
- No F3-06 UI / F3-07 / FCG-1 close / F3-08 / F3-09 / M4
- No Astra / Daybreak contact
- Disposable boundary disclosed: stub + live pins + 00117 + 00118+ (not clean greenfield 00001–00117)
