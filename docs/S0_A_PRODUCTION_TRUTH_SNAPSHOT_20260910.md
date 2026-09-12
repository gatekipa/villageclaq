# S0-A — Production Truth Snapshot (2026-09-10)

**Status:** READ-ONLY EVIDENCE — NO REMEDIATION  
**Collected by:** VillageClaq Chief  
**Canonical repo (founder):** `C:\Users\nanye\Documents\villageclaq`  
**GitHub:** gatekipa/villageclaq  
**Supabase project:** villageclaq / `llbnliixczcqfftxpsmb`  
**Production main SHA:** `0559b758bc53df3ec8081e361ffd022c1f19be43`  
**Master PRD hard-freeze tip:** `050be86c9df3455c66b27bb5853eb786228b4009` (governance on PR #71)  
**Security-approved PRD lineage tip:** `a04cdc640234ef7db95e6da3bde8e7f4668062c6`  
**Mutations during S0-A:** ZERO  
**Message sends during S0-A:** ZERO  

---

## 1. Production application state

| Item | Value |
|------|-------|
| main tip | `0559b758bc53df3ec8081e361ffd022c1f19be43` (Trust Cut 1 / PR #67) |
| Production Vercel deployment | `dpl_36vZUWy3XZb8QXmNU8c2kJLrxFEH` |
| Deploy SHA | `0559b758bc53df3ec8081e361ffd022c1f19be43` |
| Deploy state | READY |
| target | production |
| Correspondence | **CONFIRMED** — production deploy SHA matches current main |

---

## 2. Applied migration history

### Production `supabase_migrations.schema_migrations` (exact, 28 rows)

| version | name |
|---------|------|
| 20260417005634 | meeting_minutes_rls_fixes |
| 20260417015620 | elections_anonymity_fix |
| 20260417024813 | announcements_rls_fix |
| 20260417105632 | security_hardening |
| 20260417111410 | membership_insert_lockdown |
| 20260417112143 | defense_in_depth |
| 20260417135524 | gap_remediation |
| 20260417171826 | standing_recalc_triggers |
| 20260417192826 | 00080_configurable_standing_rules |
| 20260417223038 | 00081_dispatch_phone_rpcs |
| 20260417230818 | 00082_transfer_workflow |
| 20260418011014 | 00083_final_hardening |
| 20260418014832 | 00084_platform_rbac_helpers |
| 20260418020658 | 00085_platform_impersonation_and_user_lifecycle |
| 20260608215243 | 00086_whatsapp_status_events |
| 20260609202651 | 00087_payment_receipt_notification_idempotency |
| 20260611050339 | 00088_welcome_notification_idempotency |
| 20260611145032 | 00089_relief_hosting_notification_idempotency |
| 20260611173158 | 00090_payment_reminder_notification_idempotency |
| 20260611205700 | 00091_standing_change_notification_idempotency |
| 20260611233806 | 00093_money_path_notification_idempotency |
| 20260612030906 | 00094_invitation_loan_overdue_idempotency |
| 20260612044501 | 00095_phone_invitation_matching |
| 20260612140132 | 00096_remittance_notification_idempotency |
| 20260624232952 | apply_00108_member_privacy_hardening |
| 20260624235754 | drop_duplicate_member_financial_select_policies_00109 |
| 20260625173802 | fix_archive_platform_user_profile_fields |
| 20260625181300 | harden_relief_branch_summary |

### Repository inventory (main)

- **115** files under `supabase/migrations/` (`00001` … `00113`).
- Not in production migration log (among others): **00106**, **00107**, **00112**, **00113**, F3 ledger chain, PR #70 `notification_policy` schema.
- `to_regclass('public.notification_policies')` = **NULL**; `agentic_action_intents` = **NULL**.

### Drift summary

Production tracking starts mid-stream (2026-04-17). Early numbered migrations are not present as named versions (objects may pre-exist from bootstrap — PARTIAL). Late repo migrations and CREATE-NOT-APPLY artifacts are missing from the live log. No duplicate version keys observed.

---

## 3. Membership / authorization helpers (production)

### Status vocabulary (CONFIRMED)

`active | pending_approval | exited | suspended | archived`

### Helper truth

| Function | SECURITY DEFINER | search_path | Status filter |
|----------|------------------|-------------|---------------|
| `is_group_member` | YES | unset | **NONE** |
| `is_group_admin` | YES | unset | **NONE** |
| `is_group_admin_or_owner` | YES | `public` | **NONE** |
| `has_group_permission` | YES | `public` | **NONE** |
| `get_user_group_ids` | YES | unset | **NONE** |

**CONFIRMED P0:** helpers are status-blind (exited/suspended/pending/archived may still pass).

### Memberships RLS (production highlights)

- INSERT pending self-member path present.
- Proxy INSERT gated by `get_user_group_ids`.
- SELECT via self / `get_user_group_ids` / platform staff.
- DELETE: self leave OR `is_group_admin_or_owner`.

---

## 4. RLS / notifications_queue

`notifications_queue` INSERT policy `Authenticated users can queue notifications`: `WITH CHECK (auth.uid() IS NOT NULL)` — **no tenant gate**. **CONFIRMED P0**.

SELECT/UPDATE limited to `is_platform_staff()`.

---

## 5. SECURITY DEFINER inventory

- **88** DEFINER functions in `public`.
- Most report anon+authenticated EXECUTE via default grants; body authz is the real gate.
- High-risk callables present (join codes, proxy claim, cast_ballot, contact getters, transfers, etc.).
- Missing `search_path` on several helpers — **P1**.

---

## 6. Grants

Sampled tables (`memberships`, `payments`, `elections`, ballots, receipts, `notifications_queue`): anon+authenticated hold SELECT/INSERT/UPDATE/DELETE/**TRUNCATE**/REFERENCES/TRIGGER. RLS is the intended control; least-privilege revocation incomplete.

---

## 7. Cross-tenant reference integrity

| Area | Classification |
|------|----------------|
| Parent FKs | DB-ENFORCED |
| Same-group composites (attendance, loans, fines, election candidates/positions, savings) | **MISSING** |
| App/RPC guards | COMMAND-ENFORCED / PARTIAL (not exhaustively proven) |

---

## 8. Notification outbound

- Queue forge surface CONFIRMED (INSERT RLS).
- Trust Cut 1 fail-closed prefs **deployed** on main.
- Policy schema tables **not present**.
- 00106/00107 **not** in production migration log (DORMANT retained).
- No sends executed in S0-A.

---

## 9. Storage

Buckets: `avatars` (public), `group-documents` (private), `receipts` (private).

INSERT policies allow path when `storage_path_group_id(name) IS NULL` — **fail-open on parse**. SELECT uses `storage_path_group_id_v2`. Repo **00112** not in production migration log. **CONFIRMED P0/P1**.

---

## 10. Service worker (`public/sw.js` @ main)

- Caches: `villageclaq-v2`, `villageclaq-static-v2`, `villageclaq-data-v2`.
- `/api/` and `supabase` hostnames network-first then **write DATA_CACHE**.
- No sign-out purge; no message handler; no tenant/user partition.
- `skipWaiting` / `clients.claim` present.

---

## 11. Elections

- Ballots: no voter column (anonymous); `cast_at DEFAULT now()`.
- Receipts: `voter_membership_id`, `voted_at DEFAULT now()`.
- `cast_ballot`: requires standing=`good`; **does not** check `membership_status='active'`.
- Cascades from elections/memberships present.
- No voter→choice mapping retrieved.

---

## 12. Relief

`get_relief_branch_summary` DEFINER with org boundary via `get_user_group_ids`; anon EXECUTE false; harden migration present in production log. Claim/payout FKs CASCADE.

---

## 13. Njangi (savings)

`savings_cycles`, `savings_participants`, `savings_contributions` exist. FKs CASCADE to cycle/membership. Same-group composite **MISSING**. Deeper CHECK inventory PARTIAL.

---

## 14. F0/F3 prerequisites

- `uuid-ossp` + `pgcrypto` in `extensions`.
- Financial ledger epoch relations **NOT PRESENT**.
- F3 **not applied**. Deployability dry-run = S0-013 (not started).

---

## 15. Destructive delete

Widespread `ON DELETE CASCADE` from memberships/elections/plans. Historical removal audit counts: **CANNOT CONFIRM** (PII avoidance).

---

## 16. PITR / backup

**CANNOT CONFIRM** via authorized tooling used. Do not guess. S0-B not started.

---

## 17. PostgREST Max Rows

**CANNOT CONFIRM**. Do not infer 1000.

---

## 18. PR #69 / #70

| PR | Head | State |
|----|------|-------|
| #69 | `a8cdeaa98e6bb9e3a6cccaf815aa4ae4441b59a7` | DRAFT OPEN, pure foundation |
| #70 | `0f258726c9328ee0204f7b5dee9efceebe7265b9` | DRAFT OPEN, CREATE-NOT-APPLY, unapplied; Vercel FAILURE observed on tip |

---

## 19. Claim matrix (significant)

| Claim | Classification |
|-------|----------------|
| Helpers ignore exited/status | CONFIRMED |
| Queue INSERT without tenant check | CONFIRMED |
| Broad TRUNCATE grants | CONFIRMED (RLS still gate) |
| Storage INSERT fail-open on NULL path | CONFIRMED |
| SW caches API/Supabase; no logout purge | CONFIRMED |
| Migration log incomplete vs 115 repo files | CONFIRMED |
| 00112 / policy schema / F3 live | NOT PRESENT |
| `cast_ballot` lacks active status | CONFIRMED |
| Same-group DB constraints | MISSING / PARTIAL |
| PITR / Max Rows / delete audit counts | CANNOT CONFIRM |

---

## 20. CONFIRMED P0

1. Status-blind membership helpers (`is_group_member` / admin / permission / `get_user_group_ids`).
2. `notifications_queue` INSERT for any authenticated UID.
3. Storage INSERT fail-open when group-path parse returns NULL.

## 21. CONFIRMED P1

1. Missing `search_path` on DEFINER helpers.
2. SW API/Supabase caching without purge/partition.
3. Migration inventory drift (28 vs 115).
4. Missing same-group DB composites.
5. Election cast without active membership_status.
6. Broad default table privileges.
7. 00112 not applied; storage helper v1/v2 inconsistency across commands.

## 22. NOT PRESENT / SUPERSEDED high-severity

- F3 ledger live — NOT PRESENT (expected).
- PR #70 schema live — NOT PRESENT.
- Announcement 00106/00107 applied — NOT PRESENT.

## 23. CANNOT CONFIRM

- PITR/backup retention
- PostgREST Max Rows
- Destructive-delete audit aggregates
- Exhaustive Njangi CHECK inventory
- Full DEFINER body authz audit

---

## 24. Safety

Production SQL catalog/SELECT only. Mutation ZERO. Message sends ZERO. No PR #71 main merge.

## 25. Next

**S0-B — Recovery preservation + isolated restore proof** (do not start until separately authorized).
