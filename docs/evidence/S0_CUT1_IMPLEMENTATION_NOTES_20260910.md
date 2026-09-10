# S0 Cut 1 implementation notes (2026-09-10)

**Contract SHA:** `5263f160943374676362b3983f39ac510a7930a2`  
**Base:** `0559b758bc53df3ec8081e361ffd022c1f19be43`  
**Migration:** `supabase/migrations/00114_s0_p0a_cut1_active_authorization.sql`  
**PRODUCTION APPLY NOT AUTHORIZED**

## Disposable method

1. Generate fixture + migration (already committed):
   - `tests/s0-cut1-active-authorization/generate_fixture.py`
   - `tests/s0-cut1-active-authorization/generate_cut1_sql.py`
2. Run `tests/s0-cut1-active-authorization/run.sh` (local postgres; installs `postgresql` if missing).
3. Static asserts: `npm run test:s0-cut1-active-authorization`.

Schema-from-repo (`00001`–`00113` on bare postgres) cannot boot without Supabase `auth` / storage. Full 375-policy catalog rehearsal on a prod-shaped dump remains **HOLD**.

## Live name mappings

- §24.7 `Group admins can manage payment config` → live `Admins can insert/update/delete payment config`
- §24.7 `rls_lr_all` → **NOT PRESENT**; live `Members request loans` + `Admin manage loans` on `loan_requests_v1`
- Helper-only `rls_const_*` / `rls_amend_update|delete` inherit REPLACE (asserted, not DROP+CREATE)

## Helper fingerprints (live `prosrc` md5)

| Function | md5 |
|----------|-----|
| `is_group_member` | `b91a35aadb657fa2cd2c99e9313ca0f1` |
| `get_user_group_ids` | `a9865ade7502badcd2b92a74429ac1d9` |
| `is_group_admin` | `a606b2986f998e8cd6ec9f6f488f6172` |
| `is_group_admin_or_owner` | `44e3246f8dab340bf65a9766c70baac2` |
| `is_group_owner` | `b57b416768d1af85bd50f07bcb9c733f` |
| `has_group_permission` | `9948d97decfc42d3159a34d3f04934b9` |
| `create_proxy_member` | `10ab1a40d56ab1cc96fc3e59d23cd503` |
