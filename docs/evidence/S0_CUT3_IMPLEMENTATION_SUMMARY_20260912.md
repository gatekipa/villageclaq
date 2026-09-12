# S0 Cut 3 Implementation Summary — 2026-09-12

**Verdict for Chief: PASS (implementation / disposable qualification).**  
**PRODUCTION APPLY NOT AUTHORIZED. PRODUCTION DEPLOY NOT AUTHORIZED.**  
**This PR stays OPEN / DRAFT / UNMERGED.**  
**Do not merge PR #79. Do not merge this PR. Do not apply 00116 to production.**

## Pins

| Pin | Value |
|-----|-------|
| Branch | `security/s0-p0c-cut3-implementation-20260912` |
| Planning contract ancestor | `b85d4164b9b10c87597e34de74b527a12bc571af` — **is ancestor** |
| `main` at start (no drift) | `1f1221eeb9207b692a7e507ae95acfc9aabac113` |
| Draft PR | https://github.com/gatekipa/villageclaq/pull/80 |
| Migration | `supabase/migrations/00116_s0_p0c_cut3_storage_path_fail_closed.sql` |
| **00116 SHA-256** | `f24cf5c65b34497cf8c4abff80cfcdc3bf746d16a0cc8cca7ff1a04da649d4e7` |
| Helpers created | **2** (`storage_group_documents_authorized`, `storage_receipts_authorized`) |
| Policies replaced | **8** (gdocs + receipts × SELECT/INSERT/UPDATE/DELETE) |
| Build | `npx tsc --noEmit` + `npm run build` **PASS** |

00116 was not edited after this SHA was recorded and the disposable suite was re-run against that exact file.

## What landed

1. **Exactly one new migration** — atomic `BEGIN` → `CUT3_ABORT` preconditions → create two bucket-bound helpers → owner/grants → replace exactly eight policies → postconditions → `COMMIT`. Failure rolls back. No NOTICE+continue. No `00117`. No edits to `00001`–`00115`, Cut 2, or `notifications_queue`.
2. **U02 caller only** — `src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx` path is now `finance-record/{groupId}/{ts}-{filename}`. U01 / U03 / U07 grammars unchanged.
3. **Disposable REAL `storage.objects` RLS** — local PostgreSQL 16 database `s0p0c_cut3_disposable`. Authenticated `SET ROLE` actors executed real SELECT/INSERT/UPDATE/DELETE/UPSERT. Not helper-only. Zero production writes.

## DB-first release (documented — not executed)

| Phase | Rule |
|-------|------|
| **Phase A (future, separately authorized)** | Apply this exact `00116` while the **production** app still emits UUID-first U02. Verify helpers/policies/postconditions. Ordinary active member on `finance-record` → DENY; `finances.record`\|`manage` → ALLOW. NULL-ALLOW closed. |
| **APP-FIRST** | **FORBIDDEN / `CUT3_RELEASE_ABORT`**. Emitting `finance-record` before 00116 would hit live NULL-ALLOW. |
| **Phase B (future, after Phase A PASS only)** | Deploy the U02 caller change only. No U01/U03/U07 grammar drift. No object migration. |
| **CLOSED** | Only when Phase A PASS **and** Phase B PASS. DB-only is TRANSITION, not closed. |
| **This PR** | Stays unmerged until Phase A prod PASS later. Shipping the U02 source change on this branch is **not** Phase B activation. |

## Helpers

Both `SECURITY DEFINER`, `OWNER postgres`, `SET search_path TO ''`, fully qualified refs. `REVOKE` PUBLIC. EXECUTE: anon **NO**, authenticated **YES**, service_role **NO**. `p_operation` only `select\|insert\|update\|delete` else FALSE. No uid arg. No browser bucket arg. Fail-closed: NULL / invalid UUID / unknown / missing / extra / encoding → FALSE. No unguarded `::uuid` (no `22P02`).

| Helper | Grammars |
|--------|----------|
| `storage_group_documents_authorized` | UUID-first, minutes, constitutions, relief-claims (member-self), projects (`projectId` → `projects.group_id`), logos (SELECT `is_group_member`; INSERT/UPDATE/DELETE DENY) |
| `storage_receipts_authorized` | UUID-first U01 (`is_active_group_member` insert), finance-record U02 (`finances.record`\|`manage`), dispute-docs (member-self) |

Stronger gates preserved: `documents.manage`, `minutes.manage`, `is_group_admin` where frozen.

## Policies

Each: `bucket_id` literal **AND** helper(`name`, op). UPDATE has **both** USING and WITH CHECK. SELECT: no NULL-OR. v1/v2 definitions kept; removed from policy authority.

## Disposable RLS (key results)

Environment: local PG 16, role `postgres` (elevated) for policy apply — same class as Dashboard SQL Editor. `storage.objects` RLS DML as `authenticated`.

| ID | Result |
|----|--------|
| T-U01-01 ordinary active INSERT UUID-first receipts | ALLOW |
| T-U02-01 finance INSERT `finance-record/` | ALLOW |
| T-U02-02 ordinary member INSERT `finance-record/` | DENY |
| T-U02-03 historical UUID-first SELECT | ALLOW |
| T-U03-01 / U03-NEG-* | ALLOW self; DENY other-mid / cross / missing / malformed (no 22P02) |
| T-U07-01 / U07-NEG-* | same polarity on gdocs relief-claims |
| T-LOGOS-01..04 | G1 SELECT ALLOW; G2 DENY; writes DENY including admin |
| Projects lookup | admin INSERT ALLOW; member SELECT ALLOW; cross/missing/non-admin write DENY |
| D31–D34 inactive writes | DENY |
| D35 pending SELECT | ALLOW (`is_group_member`) |
| D36–D38 UPDATE transitions | cross-tenant DENY; old garbage DENY; same-tenant authorized ALLOW |
| UPS-01..12 | 2 ALLOW / 10 DENY as frozen |
| D40 service_role EXECUTE helpers | DENY |
| R05 anon SELECT private object | DENY |
| ENC-* | **740 / 740 DENY**, `raised_22p02=false`, per-class IDs recorded |
| Live shape rehearsal | gdocs **25 = 6 logos + 14 constitutions + 5 uuid-first**; receipts uuid-first shapes; all AUTHORIZED or EXPLICITLY DENIED; unknown prefixes **0** |

Signed-URL authority = fail-closed SELECT. Disposable qualified SELECT RLS, not Storage HTTP signing.

## CUT3_ABORT disposable notes

Preconditions used exact Cut 2 pair `20260912033612` / `s0_p0b_cut2_notification_queue` (not count-only), exact eight live policy `pg_get_expr` strings, exact v2 + Cut 1 helper md5s, new helpers absent, private buckets, `projects.id` + `projects.group_id` uuid NOT NULL, avatars uid-first, 28 `storage.objects` grant rows.

CR-bearing v1 / `is_group_member`: Chief live abort pins `fb6155e6…` / `4b1bbd54…` remain accepted. Byte-identical embedded `pg_get_functiondef_exact` on disposable PG16 hashes `5b535da3…` / `756c2202…`. 00116 accepts **only those pairs**. Any other hash → `CUT3_ABORT`. Production live pin is unchanged.

`proconfig` for `SET search_path TO ''`: live catalog form `search_path=` and PG16 stored form `search_path=""` both accepted. md5 of `pg_get_functiondef` still keys the live Cut 1 pins.

**No production SQL, storage, policy, or bucket mutation was performed.**

## Explicit non-actions

- PR #79 left OPEN DRAFT UNMERGED
- `00116` not applied to `llbnliixczcqfftxpsmb`
- No Vercel production deploy
- No merge to `main`
- No Cut 2 / M2 / F3-06 / UI rebuild
- No avatars policy change
- No object rename/move

## Next gate

Daybreak review of exact functional SHA + 00116 SHA-256 + evidence tip.  
Founder Phase A DB auth is a **later** step. Do not apply, merge, or deploy from this PR.
