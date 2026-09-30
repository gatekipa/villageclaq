-- Owner correction to FQ-09: preserve due_day 1..31 as the schedule anchor.
-- Each generated obligation uses the last calendar day only for a short month.
-- Existing obligations are deliberately unchanged; paid/history rows require
-- explicit reviewed correction, not a bulk migration rewrite.
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
      LEAST(NEW.due_day, EXTRACT(DAY FROM (
        pg_catalog.date_trunc('month', due::timestamp) + INTERVAL '1 month - 1 day'
      ))::integer)
    );
  END IF;

  CASE NEW.frequency
    WHEN 'monthly' THEN period := pg_catalog.to_char(due, 'Month YYYY');
    WHEN 'quarterly' THEN period := 'Q' || EXTRACT(QUARTER FROM due) || ' ' || EXTRACT(YEAR FROM due);
    WHEN 'annual' THEN period := EXTRACT(YEAR FROM due)::text;
    WHEN 'one_time' THEN period := pg_catalog.to_char(due, 'YYYY-MM-DD');
  END CASE;

  FOR mem IN
    SELECT id FROM public.memberships
    WHERE group_id = NEW.group_id
      AND membership_status = 'active'
      AND standing <> 'banned'
  LOOP
    INSERT INTO public.contribution_obligations (
      contribution_type_id, membership_id, group_id, amount, currency,
      due_date, period_label, status
    ) VALUES (
      NEW.id, mem.id, NEW.group_id, NEW.amount, NEW.currency,
      due, period, 'pending'
    ) ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$;

-- SIX's ISO 4217 List One gives TZS two minor units. Keep every other
-- supported currency unchanged and preserve the function's existing ACL.
CREATE OR REPLACE FUNCTION financial_core.currency_scale(p_currency text)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE upper(p_currency)
    WHEN 'XAF' THEN 0 WHEN 'XOF' THEN 0
    WHEN 'UGX' THEN 0 WHEN 'RWF' THEN 0
    WHEN 'TZS' THEN 2
    WHEN 'NGN' THEN 2 WHEN 'GHS' THEN 2 WHEN 'KES' THEN 2
    WHEN 'ZAR' THEN 2 WHEN 'ETB' THEN 2 WHEN 'CDF' THEN 2
    WHEN 'USD' THEN 2 WHEN 'EUR' THEN 2 WHEN 'GBP' THEN 2
    WHEN 'CAD' THEN 2 WHEN 'CHF' THEN 2 WHEN 'AUD' THEN 2
    WHEN 'AED' THEN 2
    ELSE NULL
  END;
$$;
