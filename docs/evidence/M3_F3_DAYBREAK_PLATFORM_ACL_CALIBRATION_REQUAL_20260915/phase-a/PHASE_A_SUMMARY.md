# Phase A — Independent Supabase Platform-ACL Calibration

**Verdict:** `CONTINUE`

## Identity
- Ref: `jkorwnwwmdeflfntxntl` (≠ production `llbnliixczcqfftxpsmb`)
- Name: `villageclaq-f3-management-api-disposable-20260913`
- Org: `eyztkzkprpmlmcabrfef`
- Sentinel + destructive opt-in: present (`villageclaq-f3-dbpush-20260913-authorized`)
- Dedicated disposable credentials: used (`VILLAGECLAQ_F3_DISPOSABLE_*`)
- Ambient DATABASE_URL / production URLs: absent
- Connection: session-mode pooler (same as db push candidate)
- Management API identity GET: ok (via qualify helper)

## Session
- current_user / session_user: `postgres` / `postgres`
- PostgreSQL: `17.6` (num 170006)
- public schema owner: `pg_database_owner`
- pg_default_acl applicable rows: 3; exploded tuples: 48

## Canary
- Name: `public.__f3_acl_platform_canary_20260915`
- Created → ACL captured → proven vs pg_default_acl → DROP CASCADE
- Cleanup: all canary objects absent = `true`
- Default privileges: **not altered**

## service_role proof
- equal (every canary non-owner service_role tuple predicted): `true`
- sets_equal (exact same grants): `true`
- Table: arwdDxtm → SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN (grantor postgres, not grantable)
- Sequence: rwU → SELECT,UPDATE,USAGE (grantor postgres, not grantable)

## Envelope
- Sealed: yes → `/workspace/f3-platform-acl-cal/platform-acl-envelope.json`
- digest_sha256: `eb58900b492b95371decfdab86b3786afc2c8089c6b0a117497f9e0b22c41a2a`
- Provenance: disposable pg_default_acl + canary agreement ONLY (not financial_ledger_epochs / not 72af6699)

## Bans respected
- No production contact
- No disposable reset
- No migrations 00118–00123
- No ALTER DEFAULT PRIVILEGES
- No hosted fingerprint adoption
- No delete/pause
- No Daybreak Blue/Astra contact
- Secrets sanitized from artifacts
