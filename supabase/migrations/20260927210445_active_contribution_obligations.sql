-- Founder qualification FQ-03: contribution enrollment must create obligations
-- only for currently active memberships. Archived, exited, suspended, rejected,
-- and pending memberships retain their history but receive no new debt.

BEGIN;

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
      pg_catalog.least(NEW.due_day, 28)
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

REVOKE ALL ON FUNCTION public.generate_obligations_for_type() FROM PUBLIC, anon, authenticated;

COMMIT;