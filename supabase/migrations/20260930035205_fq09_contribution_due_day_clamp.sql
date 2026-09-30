-- FQ-09: creating a contribution type with a due day failed with
-- 42883 "function pg_catalog.least(integer, integer) does not exist".
-- LEAST is an SQL conditional expression, not a catalog function, so it
-- cannot be schema-qualified. This restores the approved Build-10 rule
-- (due day clamped to 28 in the base month; src/lib/contribution-schedule.ts
-- clampDueDay) with the valid expression. Only that expression changes;
-- the body is otherwise identical to the live definition (prosrc md5
-- 317b18a3f1d3d8c999b88fade40624b0). CREATE OR REPLACE keeps owner and ACL.

CREATE OR REPLACE FUNCTION public.generate_obligations_for_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  mem record;
  due date;
  period text;
BEGIN
  IF NOT NEW.enroll_all_members THEN
    RETURN NEW;
  END IF;

  due := COALESCE(NEW.start_date, CURRENT_DATE);
  IF NEW.due_day IS NOT NULL THEN
    due := pg_catalog.make_date(
      EXTRACT(YEAR FROM due)::integer,
      EXTRACT(MONTH FROM due)::integer,
      LEAST(NEW.due_day, 28)
    );
  END IF;

  CASE NEW.frequency
    WHEN 'monthly' THEN period := pg_catalog.to_char(due, 'Month YYYY');
    WHEN 'quarterly' THEN period := 'Q' || EXTRACT(QUARTER FROM due) || ' ' || EXTRACT(YEAR FROM due);
    WHEN 'annual' THEN period := EXTRACT(YEAR FROM due)::text;
    WHEN 'one_time' THEN period := pg_catalog.to_char(due, 'YYYY-MM-DD');
  END CASE;

  FOR mem IN
    SELECT id
    FROM public.memberships
    WHERE group_id = NEW.group_id
      AND membership_status = 'active'
      AND standing <> 'banned'
  LOOP
    INSERT INTO public.contribution_obligations (
      contribution_type_id,
      membership_id,
      group_id,
      amount,
      currency,
      due_date,
      period_label,
      status
    ) VALUES (
      NEW.id,
      mem.id,
      NEW.group_id,
      NEW.amount,
      NEW.currency,
      due,
      period,
      'pending'
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;
