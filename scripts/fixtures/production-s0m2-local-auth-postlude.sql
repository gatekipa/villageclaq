-- Local-only schema-only dump adaptation. pg_dump --schema=public omits the
-- auth.users trigger because auth is outside the requested schema, even though
-- public.handle_new_user() is included. Restore the production trigger before
-- seeding fictional users. This file is not an application migration.
DO $pre$
BEGIN
  IF to_regclass('auth.users') IS NULL OR
     to_regprocedure('public.handle_new_user()') IS NULL THEN
    RAISE EXCEPTION 'LOCAL_AUTH_POSTLUDE_PREREQUISITE_MISSING';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger
      WHERE tgrelid='auth.users'::regclass
        AND tgname='on_auth_user_created' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'LOCAL_AUTH_POSTLUDE_ALREADY_APPLIED';
  END IF;
END
$pre$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
