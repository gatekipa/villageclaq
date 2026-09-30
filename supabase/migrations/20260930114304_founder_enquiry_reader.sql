-- A dedicated enquiry reader grant avoids making the founder platform_staff:
-- every existing staff role can see unrelated platform/member information.
-- Grants are data, provisioned only after verified identity on the isolated
-- backend; this migration does not grant a user access by itself.
CREATE TABLE public.enquiry_readers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.enquiry_readers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enquiry_readers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.enquiry_readers TO authenticated;
CREATE POLICY enquiry_reader_self ON public.enquiry_readers
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE POLICY designated_enquiry_reader_select ON public.contact_enquiries
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.enquiry_readers r WHERE r.user_id = (SELECT auth.uid()))
  );

CREATE TABLE public.enquiry_handling_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  enquiry_id uuid NOT NULL REFERENCES public.contact_enquiries(id),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  old_status public.enquiry_status NOT NULL,
  new_status public.enquiry_status NOT NULL,
  reply_changed boolean NOT NULL,
  handled_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.enquiry_handling_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.enquiry_handling_log FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.handle_designated_enquiry(
  p_enquiry_id uuid, p_status public.enquiry_status, p_reply text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid := auth.uid(); v_old public.contact_enquiries%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.enquiry_readers WHERE user_id = v_actor
  ) THEN
    RAISE EXCEPTION 'ENQUIRY_ACCESS_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_reply IS NOT NULL AND length(trim(p_reply)) > 5000 THEN
    RAISE EXCEPTION 'REPLY_TOO_LONG' USING ERRCODE = '22001';
  END IF;
  SELECT * INTO v_old FROM public.contact_enquiries
    WHERE id = p_enquiry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ENQUIRY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.contact_enquiries SET
    status = p_status,
    reply = CASE WHEN p_reply IS NULL THEN reply ELSE trim(p_reply) END,
    replied_at = CASE WHEN p_reply IS NULL OR trim(p_reply) = '' THEN replied_at ELSE now() END
  WHERE id = p_enquiry_id;
  INSERT INTO public.enquiry_handling_log (
    enquiry_id, actor_user_id, old_status, new_status, reply_changed
  ) VALUES (
    p_enquiry_id, v_actor, v_old.status, p_status,
    p_reply IS NOT NULL AND trim(p_reply) IS DISTINCT FROM COALESCE(v_old.reply, '')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.handle_designated_enquiry(uuid, public.enquiry_status, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_designated_enquiry(uuid, public.enquiry_status, text)
  TO authenticated;
