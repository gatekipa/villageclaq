# S0 Cut 3 Implementation Summary — 2026-09-12 (Daybreak HOLD — FUNCTION ACL EXACTNESS)

**Verdict for Chief: PASS (implementation / disposable qualification after ACL exactness).**  
**PRODUCTION APPLY NOT AUTHORIZED. PRODUCTION DEPLOY NOT AUTHORIZED.**  
**This PR stays OPEN / DRAFT / UNMERGED.**  
**Do not merge PR #79. Do not merge this PR. Do not apply 00116 to production.**

## Pins

| Pin | Value |
|-----|-------|
| Branch | `security/s0-p0c-cut3-implementation-20260912` |
| Planning contract ancestor | `b85d4164b9b10c87597e34de74b527a12bc571af` — **is ancestor** |
| `main` | `1f1221eeb9207b692a7e507ae95acfc9aabac113` |
| Draft PR | https://github.com/gatekipa/villageclaq/pull/80 |
| Prior functional (superseded) | `61b349b4af368e331969b45bf7774a5a3f1baeef` |
| Prior 00116 SHA-256 (superseded) | `4b3588e81977adab1b29d80aa87f02c21bcfbab98ec1357a89c2e9586799e630` |
| **00116 SHA-256 (current)** | `ba55d1f6f0f2f05d681fdc60386513580267ddc81892d79c05a7893ef43afd33` |
| **Executable / functional tip** | `ba8d75455ac04ebfd998eee6fafcb54abb73da8d` |
| Dual hashes in 00116 | **REMOVED** (`5b535da3…` and `756c2202…` not accepted) |
| Helpers created (disposable) | **2** |
| Policies replaced (disposable) | **8** |
| Build | `npx tsc --noEmit` **PASS** + `npm run build` **PASS** |

The evidence commit after this qualification is **docs/evidence only**. If any later executable change lands, that SHA becomes functional and requalification is required.

## FUNCTION ACL EXACTNESS (this hold)

ACL tuple is now `(function_name, role_name, privilege_type, grantor_name, is_grantable)`.

- Source: `aclexplode(COALESCE(proacl, acldefault('f', proowner)))`
- Grantee OID 0 → `PUBLIC`. Grantor OID 0 is **not** treated as PUBLIC; grantor must resolve via `pg_roles` to `postgres`.
- Every expected EXECUTE row: `grantor_name='postgres'`, `is_grantable=false` (compared as text `'false'`).
- Set equality uses **parenthesized** `concat_ws('|', …)` EXCEPT in **both** directions. Unparenthesized `UNION ALL`/`EXCEPT` binds so extras can vanish.
- Premigration: exact 5-tuple equality for v1, v2, `is_active_group_member`, `is_group_member`, `is_group_admin`, `has_group_permission`.
- Postmigration: exact 5-tuple equality for `storage_group_documents_authorized(text,text)` and `storage_receipts_authorized(text,text)` — authenticated + postgres EXECUTE, grantor postgres, `is_grantable=false`; PUBLIC / anon / service_role **NO**.

### Disposable ACL negatives (never production)

| ID | Expected | Actual | pass |
|----|----------|--------|------|
| ACL-PRE-A | PASS | PASS | true |
| ACL-PRE-B | CUT3_ABORT | CUT3_ABORT | true |
| ACL-PRE-B-FILE | CUT3_ABORT | CUT3_ABORT | true |
| ACL-PRE-C | CUT3_ABORT | CUT3_ABORT | true |
| ACL-PRE-D | CUT3_ABORT | CUT3_ABORT | true |
| ACL-PRE-E | CUT3_ABORT | CUT3_ABORT | true |
| ACL-POST-BASELINE | PASS | PASS | true |
| ACL-POST-AUTH-WGO | CUT3_ABORT | CUT3_ABORT | true |
| ACL-POST-PUBLIC | CUT3_ABORT | CUT3_ABORT | true |
| ACL-POST-ANON | CUT3_ABORT | CUT3_ABORT | true |
| ACL-POST-SERVICE-ROLE | CUT3_ABORT | CUT3_ABORT | true |
| ACL-POST-WRONG-GRANTOR | CUT3_ABORT | CUT3_ABORT | true |
| ACL-POST-EXTRA-GRANTEE | CUT3_ABORT | CUT3_ABORT | true |

PRE-B proves `WITH GRANT OPTION` on an otherwise expected role aborts. PRE-C proves a non-postgres grantor aborts (via disposable `makeaclitem` rewrite — `SET ROLE` as superuser still records grantor postgres). PRE-D/E prove extra and missing rows abort. POST-* prove the same for the new helpers.

## Remediation (R1–R15)

1. **Exact-hash-only** — CUT3_ABORT accepts only live md5 pins. Disposable hex fixture (`scripts/_cut3_live_functiondef_hex.json`) reproduces those fingerprints **before** unmodified 00116 bytes apply. 00116 was not weakened for disposable serialization.
2. **proconfig** — raw `pg_proc.proconfig`, no COALESCE. `NULL` (v1, v2, `is_group_member`) ≠ empty array ≠ `search_path=` ≠ `search_path=""`. Cut-2 helpers and new helpers accept only `ARRAY['search_path=""']`.
3. **EXECUTE ACL** — `aclexplode` role/privilege tuples, both EXCEPT directions empty.
4. **storage.objects grants** — exact 28-row set equality, not count-only.
5. **projects PK** — `pg_index` / `pg_attribute`: PRIMARY KEY key columns exactly (`id`).
6. **Overloads** — before: zero `storage_*_authorized` names in `public`. After: only `(p_name text, p_operation text)` × 2.
7. **Four new real RLS cases** (storage.objects DML):

| ID | Result |
|----|--------|
| T-U02-04-MANAGE-ONLY | ALLOW (active actor, `finances.manage` only) |
| T-U02-05-CROSS-GROUP-FINANCE | DENY (`RLS_DENY` / 42501) |
| U03-NEG-INACTIVE-OWN-MID | DENY (`RLS_DENY` / 42501) |
| U07-NEG-INACTIVE-OWN-MID | DENY (`RLS_DENY` / 42501) |

8. **Anon / negative harness** — DENY PASS only via `RLS_DENY`, `PERMISSION_DENIED`, or `ZERO_ROWS`. Unexpected exceptions → `unexpected_exception=true` and `pass=false`. Result schema: `test_id, operation, expected_result, actual_result, denial_mechanism, SQLSTATE, unexpected_exception, pass`. R05 anon SELECT = `ZERO_ROWS` DENY PASS. Harness probe 42883 is unexpected (schema `pass=false`, meta PASS).

See `docs/evidence/S0_CUT3_IMPLEMENTATION_REMEDIATION_20260912.json`.

## Suites

| Suite | Result |
|-------|--------|
| Core recorded (prior + 4 new + UPS-01..12 + D40/R05 + harness + 13 ACL) | **69 / 69 PASS** (0 fail IDs) |
| Encoding | **740 / 740 DENY**, no unexpected exceptions |
| Live shape rehearsal | **25 = 6 logos + 14 constitutions + 5 uuid-first**; unknown **0** |
| Helpers / policies | 2 / 8 |

## DB-first release (documented — not executed)

| Phase | Rule |
|-------|------|
| **Phase A (future, separately authorized)** | Apply this exact `00116` while the **production** app still emits UUID-first U02. |
| **APP-FIRST** | **FORBIDDEN**. |
| **Phase B (future, after Phase A PASS only)** | Deploy the U02 caller change only. |
| **This PR** | Stays unmerged until Phase A prod PASS later. |

## Production (read-only confirm)

- `supabase_migrations.schema_migrations` count **30**; latest `s0_p0b_cut2_notification_queue` / `20260912033612`
- `00116` **not** applied
- `storage_group_documents_authorized` / `storage_receipts_authorized` **absent**
- Eight live policies still NULL-ALLOW (`gdocs_select_group` still uses `storage_path_group_id_v2(name) IS NULL`)
- No storage mutation from this work

## Explicit non-actions

- PR #79 left OPEN DRAFT UNMERGED
- No Vercel production deploy
- No merge to `main`
- No Cut 2 / `00001`–`00115` / `00117` edits
- No avatars policy change
- No object rename/move
