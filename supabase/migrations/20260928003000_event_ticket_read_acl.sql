-- The event ticket policies introduced by 00141 are the row-level read
-- boundary, but authenticated had no table-level SELECT privilege after the
-- production-compatible baseline import. Make those policies effective
-- without restoring any direct write path.

BEGIN;

REVOKE SELECT ON public.ticket_tiers, public.ticket_purchases
  FROM PUBLIC, anon, service_role;

GRANT SELECT ON public.ticket_tiers, public.ticket_purchases
  TO authenticated;

COMMIT;
