-- SEC-005/P-001: RLS does not apply to TRUNCATE. The production S0/M2
-- catalog gives authenticated (and anon) this privilege on 90 public base
-- tables, including tenant, membership, payment, and Relief records.
-- No browser workflow legitimately truncates an application table.
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public
  FROM PUBLIC,anon,authenticated;

-- The production S0/M2 default ACL for tables created by postgres also grants
-- ALL to ordinary roles. Keep future application tables from reopening this
-- bypass when migrations run under the postgres owner.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM PUBLIC,anon,authenticated;
