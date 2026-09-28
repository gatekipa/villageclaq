# Ready-to-send Supabase owner request — isolated VillageClaq branch

Open [Supabase Support](https://supabase.com/dashboard/support/new), select project `nisipxbuvndobyxqqglf`, choose the Database/Storage category, paste the subject and body below, and attach [storage-owner-repair-nisipxbuvndobyxqqglf.sql](storage-owner-repair-nisipxbuvndobyxqqglf.sql). This is the single required owner action.

Attachment SHA-256: `F9C80F349F1974D7F97C0848DC292CD3D31A8FF63C8A09F73F503A920D3113B4`.

## Subject

Owner-only Storage policy and ACL repair on development branch `nisipxbuvndobyxqqglf`

## Request body

Please execute the attached SQL **only on development branch project `nisipxbuvndobyxqqglf`**, as `supabase_storage_admin` or through the supported provider capability that owns the managed Storage tables.

Do not run it on production project `llbnliixczcqfftxpsmb`. Do not change ownership of any managed table. No reset, data deletion, production migration, or project merge is requested.

The project `postgres` connection cannot complete this repair:

- `storage.objects`, `storage.buckets`, and `storage.buckets_analytics` are owned by `supabase_storage_admin`.
- The connector runs as `postgres`.
- `postgres` is not a member of `supabase_storage_admin`.
- The four required `storage.objects` policies are currently absent.
- `anon` and `authenticated` currently have effective `TRUNCATE` on all three managed tables, granted by `supabase_storage_admin`.

The attached transaction:

1. Requires `current_user = supabase_storage_admin` and verifies the managed owners.
2. Verifies the existing candidate helper signature `public.storage_group_documents_authorized(text,text)` without replacing the function.
3. Restores the four exact candidate policies: `gdocs_select_group`, `gdocs_insert_group`, `gdocs_update_group`, and `gdocs_delete_group`.
4. Revokes `TRUNCATE` from `PUBLIC`, `anon`, and `authenticated` on the three named managed tables.
5. Aborts if `anon` or `authenticated` retains effective `TRUNCATE`.
6. Returns policy definitions, helper metadata, effective privileges, owners, and explicit ACL grantors for verification.

Please return the complete output from all five readback queries. VillageClaq will then run its real Storage API upload, sign, read, update, delete, immutable-official-attachment, authorization, and cross-tenant denial matrix against this isolated branch.

## Why Support is required

Supabase documents creation of Storage policies through the Dashboard Storage Policies interface. That interface does not provide the combined managed-table ACL repair and auditable readback required here. The available SQL connection lacks the owning role needed to create policies on `storage.objects` and to revoke grants issued by `supabase_storage_admin`, especially on `storage.buckets_analytics`. The request therefore keeps the operation within the managed owner boundary.
