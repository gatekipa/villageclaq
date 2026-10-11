import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Disposable local PostgreSQL only. Pass a Supabase Postgres Docker container
// name or ID; this script never connects to the hosted qualification project.
const container = process.argv[2];
if (!container) {
  throw new Error('Usage: node scripts/test-event-attendance-atomic-audit.mjs <local-postgres-container>');
}

const db = `codex_att_audit_${randomBytes(5).toString('hex')}`;
const migration = readFileSync(new URL('../supabase/migrations/20261011023000_event_attendance_atomic_evidence.sql', import.meta.url), 'utf8');
const run = (database, sql) => execFileSync('docker', [
  'exec', '-i', container, 'psql', '-U', 'postgres', '-d', database,
  '-v', 'ON_ERROR_STOP=1', '-q', '-At',
], { input: sql, encoding: 'utf8', maxBuffer: 1024 * 1024 });

const setup = String.raw`
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE TYPE public.event_status AS ENUM ('upcoming', 'completed', 'cancelled');
CREATE TYPE public.attendance_status AS ENUM ('present', 'absent', 'excused', 'late');
CREATE TYPE public.checkin_method AS ENUM ('manual', 'qr');
CREATE TABLE public.events (
  id uuid PRIMARY KEY, group_id uuid NOT NULL, status public.event_status NOT NULL,
  starts_at timestamptz NOT NULL, ends_at timestamptz
);
CREATE TABLE public.memberships (
  id uuid PRIMARY KEY, group_id uuid NOT NULL, user_id uuid NOT NULL,
  role text NOT NULL, membership_status text NOT NULL
);
CREATE TABLE public.event_attendances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id),
  membership_id uuid NOT NULL REFERENCES public.memberships(id),
  status public.attendance_status NOT NULL,
  checked_in_via public.checkin_method NOT NULL,
  checked_in_at timestamptz, marked_by uuid, notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, membership_id)
);
CREATE TABLE public.group_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_id uuid NOT NULL,
  actor_id uuid, action text NOT NULL, entity_type text, entity_id uuid,
  details jsonb, description text
);
CREATE FUNCTION public.has_group_permission(p_group_id uuid, p_permission text, p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE group_id = p_group_id AND user_id = p_actor
      AND membership_status = 'active' AND role = 'owner'
  )
$$;
ALTER TABLE public.event_attendances ENABLE ROW LEVEL SECURITY;
CREATE POLICY local_attendance_read ON public.event_attendances
  FOR SELECT TO authenticated USING (true);
CREATE POLICY local_attendance_insert ON public.event_attendances
  FOR INSERT TO authenticated WITH CHECK (
    public.has_group_permission(
      (SELECT group_id FROM public.events WHERE id = event_id),
      'attendance.manage', auth.uid()
    )
  );
CREATE POLICY local_attendance_update ON public.event_attendances
  FOR UPDATE TO authenticated
  USING (public.has_group_permission(
    (SELECT group_id FROM public.events WHERE id = event_id),
    'attendance.manage', auth.uid()
  ))
  WITH CHECK (public.has_group_permission(
    (SELECT group_id FROM public.events WHERE id = event_id),
    'attendance.manage', auth.uid()
  ));
CREATE POLICY local_attendance_delete ON public.event_attendances
  FOR DELETE TO authenticated USING (true);
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.events, public.memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_attendances TO authenticated;
INSERT INTO public.events VALUES (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000100',
  'completed', now() - interval '2 hours', now() - interval '1 hour'
);
INSERT INTO public.memberships VALUES (
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000001', 'owner', 'active'
), (
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000002', 'member', 'active'
);
`;

const checks = String.raw`
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
SELECT public.record_event_attendance(
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000100', 'absent', 'manual'
);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.event_attendances) <> 1
    OR (SELECT count(*) FROM public.group_audit_logs WHERE action = 'event.attendance_recorded') <> 1
    OR (SELECT actor_id FROM public.group_audit_logs LIMIT 1)
       <> '00000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'insert/audit/actor assertion failed';
  END IF;
END $$;
CREATE TEMP TABLE initial_attendance AS
  SELECT id, checked_in_at, marked_by FROM public.event_attendances;
SELECT public.record_event_attendance(
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000100', 'absent', 'manual'
);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.event_attendances) <> 1
    OR (SELECT count(*) FROM public.group_audit_logs) <> 1
    OR EXISTS (
      SELECT 1 FROM public.event_attendances a CROSS JOIN initial_attendance i
      WHERE a.id IS DISTINCT FROM i.id
        OR a.checked_in_at IS DISTINCT FROM i.checked_in_at
        OR a.marked_by IS DISTINCT FROM i.marked_by
    ) THEN
    RAISE EXCEPTION 'RPC retry changed the row or audit';
  END IF;
END $$;
SELECT public.record_event_attendance(
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000100', 'present', 'manual'
);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.event_attendances) <> 1
    OR (SELECT status FROM public.event_attendances) <> 'present'::public.attendance_status
    OR (SELECT count(*) FROM public.group_audit_logs) <> 2
    OR NOT EXISTS (
      SELECT 1 FROM public.group_audit_logs
      WHERE action = 'event.attendance_corrected'
        AND details->>'old_status' = 'absent'
        AND details->>'new_status' = 'present'
    ) THEN
    RAISE EXCEPTION 'correction audit assertion failed';
  END IF;
END $$;
SELECT public.record_event_attendance(
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000100', 'present', 'manual'
);
UPDATE public.event_attendances SET status = status,
  checked_in_via = checked_in_via, checked_in_at = checked_in_at,
  marked_by = marked_by, notes = notes;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.group_audit_logs) <> 2 THEN
    RAISE EXCEPTION 'RPC or form no-op replay duplicated audit';
  END IF;
END $$;
UPDATE public.event_attendances SET checked_in_at = checked_in_at + interval '1 minute';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.group_audit_logs) <> 3
    OR NOT EXISTS (
      SELECT 1 FROM public.group_audit_logs
      WHERE action = 'event.attendance_corrected'
        AND details->>'old_checked_in_at' IS DISTINCT FROM details->>'new_checked_in_at'
    ) THEN
    RAISE EXCEPTION 'material timestamp correction lacked audit';
  END IF;
END $$;
CREATE FUNCTION public.qa_fail_attendance_audit() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  IF current_setting('qa.fail_attendance_audit', true) = '1' THEN
    RAISE EXCEPTION 'QA_AUDIT_FAULT';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER qa_fail_attendance_audit BEFORE INSERT ON public.group_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.qa_fail_attendance_audit();
SELECT set_config('qa.fail_attendance_audit', '1', false);
DO $$ BEGIN
  BEGIN
    PERFORM public.record_event_attendance(
      '00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000021',
      '00000000-0000-0000-0000-000000000100', 'excused', 'manual'
    );
    RAISE EXCEPTION 'AUDIT_FAULT_NOT_RAISED' USING ERRCODE = 'P0002';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'QA_AUDIT_FAULT' THEN RAISE; END IF;
  END;
END $$;
DO $$ BEGIN
  IF (SELECT status FROM public.event_attendances) <> 'present'::public.attendance_status
    OR (SELECT count(*) FROM public.group_audit_logs) <> 3 THEN
    RAISE EXCEPTION 'audit failure did not roll back attendance';
  END IF;
END $$;
SELECT set_config('qa.fail_attendance_audit', '0', false);
SELECT public.record_event_attendance(
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000100', 'excused', 'manual'
);
SELECT public.record_event_attendance(
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000100', 'excused', 'manual'
);
DO $$ BEGIN
  IF (SELECT status FROM public.event_attendances) <> 'excused'::public.attendance_status
    OR (SELECT count(*) FROM public.group_audit_logs) <> 4 THEN
    RAISE EXCEPTION 'retry after fault failed or duplicated audit';
  END IF;
END $$;
DO $$ BEGIN
  BEGIN
    UPDATE public.event_attendances
      SET membership_id = '00000000-0000-0000-0000-000000000020';
    RAISE EXCEPTION 'IDENTITY_GUARD_MISSING' USING ERRCODE = 'P0002';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM <> 'ATTENDANCE_IDENTITY_IMMUTABLE' THEN RAISE; END IF;
  END;
END $$;
DO $$ BEGIN
  IF has_function_privilege('authenticated',
      'public.guard_event_attendance_identity()', 'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.audit_event_attendance_change()', 'EXECUTE') THEN
    RAISE EXCEPTION 'trigger function PUBLIC EXECUTE not revoked';
  END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
DO $$ BEGIN
  BEGIN
    PERFORM public.record_event_attendance(
      '00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000020',
      '00000000-0000-0000-0000-000000000100', 'absent', 'manual'
    );
    RAISE EXCEPTION 'UNAUTHORIZED_RPC_ALLOWED' USING ERRCODE = 'P0002';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $$;
SET ROLE authenticated;
UPDATE public.event_attendances SET status = 'absent';
DELETE FROM public.event_attendances;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT status FROM public.event_attendances) <> 'excused'::public.attendance_status
    OR (SELECT count(*) FROM public.event_attendances) <> 1
    OR (SELECT count(*) FROM public.group_audit_logs) <> 4 THEN
    RAISE EXCEPTION 'unauthorized direct write changed stored evidence';
  END IF;
END $$;
SELECT 'PASS: atomic insert/correction, actor, retry, timestamp correction, audit rollback, denial';
`;

let created = false;
try {
  execFileSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE ${db} TEMPLATE template0`],
  { stdio: 'pipe', encoding: 'utf8' });
  created = true;
  const output = run(db, `${setup}\n${migration}\n${checks}`);
  const verdict = output.split('\n').find((line) => line.startsWith('PASS:'));
  if (!verdict) throw new Error('Local test finished without a PASS marker');
  process.stdout.write(`${verdict}\n`);
} finally {
  if (created) {
    execFileSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE ${db} WITH (FORCE)`],
    { stdio: 'pipe', encoding: 'utf8' });
  }
}
