-- H/R-004: serialize an approved transfer, preserve its source/destination
-- membership identity, and allow a return to an exited prior group without
-- minting an impossible duplicate (user_id,group_id) membership.
BEGIN;
ALTER TABLE public.member_transfers
  ADD COLUMN source_membership_id uuid REFERENCES public.memberships(id),
  ADD COLUMN dest_membership_id uuid REFERENCES public.memberships(id);

CREATE TRIGGER trg_rebind_relief_coverage_on_reactivation
  AFTER UPDATE OF membership_status ON public.memberships
  FOR EACH ROW
  WHEN (OLD.membership_status IS DISTINCT FROM 'active'
    AND NEW.membership_status='active')
  EXECUTE FUNCTION public.rebind_relief_coverage_on_transfer();

CREATE OR REPLACE FUNCTION public.execute_member_transfer(p_transfer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_caller uuid:=auth.uid();
  v_transfer public.member_transfers%ROWTYPE;
  v_source public.memberships%ROWTYPE;
  v_dest public.memberships%ROWTYPE;
  v_dest_standing public.membership_standing;
BEGIN
  IF v_caller IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error','auth_required');
  END IF;
  SELECT * INTO v_transfer FROM public.member_transfers
    WHERE id=p_transfer_id FOR UPDATE;
  IF v_transfer.id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error','transfer_not_found');
  END IF;
  IF NOT (public.is_group_admin(v_transfer.source_group_id)
       OR public.is_group_admin(v_transfer.dest_group_id)
       OR public.is_platform_staff()) THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error','not_authorized');
  END IF;
  IF v_transfer.status='completed' AND v_transfer.completed_at IS NOT NULL
     AND v_transfer.source_membership_id IS NOT NULL
     AND v_transfer.dest_membership_id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',true,'decision','recovered',
      'source_membership_id',v_transfer.source_membership_id,
      'new_membership_id',v_transfer.dest_membership_id);
  END IF;
  IF v_transfer.status<>'approved' OR v_transfer.completed_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error','transfer_not_approved');
  END IF;
  SELECT * INTO v_source FROM public.memberships
    WHERE group_id=v_transfer.source_group_id
      AND user_id=v_transfer.member_id AND membership_status='active'
    ORDER BY joined_at DESC,id LIMIT 1 FOR UPDATE;
  IF v_source.id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error','source_membership_missing');
  END IF;
  SELECT * INTO v_dest FROM public.memberships
    WHERE group_id=v_transfer.dest_group_id
      AND user_id=v_transfer.member_id
    FOR UPDATE;
  IF v_dest.id IS NOT NULL AND v_dest.membership_status='active' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error','already_in_destination');
  END IF;
  IF v_dest.id IS NOT NULL AND v_dest.membership_status<>'exited' THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'error','destination_membership_blocked');
  END IF;
  v_dest_standing:=CASE WHEN v_transfer.carry_over_standing
    THEN v_source.standing ELSE 'good'::public.membership_standing END;
  UPDATE public.memberships
    SET standing='transferred'::public.membership_standing,
      membership_status='exited',updated_at=transaction_timestamp()
    WHERE id=v_source.id;
  IF v_dest.id IS NULL THEN
    INSERT INTO public.memberships
      (user_id,group_id,role,standing,is_proxy,display_name,
       membership_status,joined_at)
    VALUES (v_transfer.member_id,v_transfer.dest_group_id,
      'member'::public.membership_role,v_dest_standing,false,
      v_source.display_name,'active',transaction_timestamp())
    RETURNING id INTO v_dest.id;
  ELSE
    UPDATE public.memberships
      SET role='member'::public.membership_role,
        standing=v_dest_standing,is_proxy=false,
        display_name=v_source.display_name,membership_status='active',
        joined_at=transaction_timestamp(),updated_at=transaction_timestamp()
      WHERE id=v_dest.id;
  END IF;
  UPDATE public.member_transfers
    SET status='completed',completed_at=transaction_timestamp(),
      source_membership_id=v_source.id,dest_membership_id=v_dest.id,
      updated_at=transaction_timestamp()
    WHERE id=v_transfer.id;
  RETURN pg_catalog.jsonb_build_object('ok',true,'decision','posted',
    'new_membership_id',v_dest.id,
    'source_membership_id',v_source.id,
    'dest_standing',v_dest_standing::text);
END
$$;
REVOKE ALL ON FUNCTION public.execute_member_transfer(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.execute_member_transfer(uuid)
  TO authenticated;
COMMIT;
