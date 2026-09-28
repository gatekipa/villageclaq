-- VillageClaq isolated Storage owner repair
-- Target project only: nisipxbuvndobyxqqglf
-- Do not run on llbnliixczcqfftxpsmb or any other project.
--
-- Required execution identity: the owner of the managed Storage tables,
-- currently supabase_storage_admin. The ordinary project postgres role is not
-- a member of that role and must not change table ownership to bypass it.

begin;

do $preflight$
declare
  v_non_owner_tables text[];
  v_table_count integer;
begin
  if current_user <> 'supabase_storage_admin' then
    raise exception
      'VC_STORAGE_OWNER_REQUIRED: current_user=%; expected supabase_storage_admin',
      current_user;
  end if;

  select array_agg(format('%I.%I owned by %I', n.nspname, c.relname, pg_get_userbyid(c.relowner)) order by c.relname)
    into v_non_owner_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'storage'
    and c.relname in ('objects', 'buckets', 'buckets_analytics')
    and c.relowner <> (select oid from pg_roles where rolname = current_user);

  if v_non_owner_tables is not null then
    raise exception 'VC_STORAGE_OWNER_MISMATCH: %', v_non_owner_tables;
  end if;

  select count(*)
    into v_table_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'storage'
    and c.relname in ('objects', 'buckets', 'buckets_analytics');

  if v_table_count <> 3 then
    raise exception
      'VC_STORAGE_TABLE_SET_MISMATCH: found %, expected 3',
      v_table_count;
  end if;

  if to_regprocedure('public.storage_group_documents_authorized(text,text)') is null then
    raise exception
      'VC_STORAGE_HELPER_MISSING: public.storage_group_documents_authorized(text,text)';
  end if;
end
$preflight$;

-- Exact group-document policies from candidate migration 00116. The helper
-- body is the current 00194 definition; this script intentionally does not
-- replace it.
drop policy if exists "gdocs_select_group" on storage.objects;
create policy "gdocs_select_group" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'group-documents'
    and public.storage_group_documents_authorized(name, 'select')
  );

drop policy if exists "gdocs_insert_group" on storage.objects;
create policy "gdocs_insert_group" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'group-documents'
    and public.storage_group_documents_authorized(name, 'insert')
  );

drop policy if exists "gdocs_update_group" on storage.objects;
create policy "gdocs_update_group" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'group-documents'
    and public.storage_group_documents_authorized(name, 'update')
  )
  with check (
    bucket_id = 'group-documents'
    and public.storage_group_documents_authorized(name, 'update')
  );

drop policy if exists "gdocs_delete_group" on storage.objects;
create policy "gdocs_delete_group" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'group-documents'
    and public.storage_group_documents_authorized(name, 'delete')
  );

-- Remove the disclosed dangerous capability from ordinary API roles. Keep
-- the managed owner and service_role ACLs unchanged for provider operations;
-- their effective state is returned by the readback below.
revoke truncate on table
  storage.objects,
  storage.buckets,
  storage.buckets_analytics
from public, anon, authenticated;

do $postcondition$
declare
  v_role text;
  v_table text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_table in array array[
      'storage.objects',
      'storage.buckets',
      'storage.buckets_analytics'
    ] loop
      if has_table_privilege(v_role, v_table, 'TRUNCATE') then
        raise exception
          'VC_STORAGE_TRUNCATE_STILL_EFFECTIVE: role=% table=%',
          v_role, v_table;
      end if;
    end loop;
  end loop;
end
$postcondition$;

commit;

-- READBACK 1: execution identity and managed-table owners.
select
  current_user,
  session_user,
  n.nspname as schema_name,
  c.relname as table_name,
  pg_get_userbyid(c.relowner) as table_owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'storage'
  and c.relname in ('objects', 'buckets', 'buckets_analytics')
order by c.relname;

-- READBACK 2: exact helper signature and execution envelope.
select
  p.oid::regprocedure::text as signature,
  pg_get_function_result(p.oid) as result_type,
  pg_get_userbyid(p.proowner) as function_owner,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  p.proconfig as function_config,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid = to_regprocedure('public.storage_group_documents_authorized(text,text)');

-- READBACK 3: effective policy definitions.
select
  polname,
  polcmd,
  polpermissive,
  array(select pg_get_userbyid(role_oid) from unnest(polroles) role_oid) as roles,
  pg_get_expr(polqual, polrelid) as using_expr,
  pg_get_expr(polwithcheck, polrelid) as with_check_expr
from pg_policy
where polrelid = 'storage.objects'::regclass
  and polname in (
    'gdocs_select_group',
    'gdocs_insert_group',
    'gdocs_update_group',
    'gdocs_delete_group'
  )
order by polname;

-- READBACK 4: effective TRUNCATE capability for API and administrative roles.
select
  role_name,
  table_name,
  has_table_privilege(role_name, table_name, 'TRUNCATE') as truncate_effective
from unnest(array['anon', 'authenticated', 'service_role', 'postgres', 'supabase_storage_admin']) role_name
cross join unnest(array[
  'storage.objects',
  'storage.buckets',
  'storage.buckets_analytics'
]) table_name
order by table_name, role_name;

-- READBACK 5: explicit TRUNCATE ACL grantors, including PUBLIC (OID 0).
select
  n.nspname as schema_name,
  c.relname as table_name,
  grantor.rolname as grantor,
  coalesce(grantee.rolname, 'PUBLIC') as grantee,
  acl.privilege_type,
  acl.is_grantable
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(c.relacl) acl
join pg_roles grantor on grantor.oid = acl.grantor
left join pg_roles grantee on grantee.oid = acl.grantee
where n.nspname = 'storage'
  and c.relname in ('objects', 'buckets', 'buckets_analytics')
  and acl.privilege_type = 'TRUNCATE'
order by c.relname, grantee, grantor;
