# SU-487325 — isolated VillageClaq Storage evidence

## Scope and target

- Ticket: `SU-487325`.
- Isolated project only: `nisipxbuvndobyxqqglf`.
- Production project `llbnliixczcqfftxpsmb` was not changed.
- Older ticket `SU-441110` concerns another project and is excluded from this evidence.
- No reset, migration-history change, managed-table ownership change, policy change, or privilege change was made while preparing this package.

## Sanitized real Storage API capture

The existing actor-matrix runner authenticated a fictional owner and made its first upload request through Supabase Storage:

```http
POST /storage/v1/object/group-documents/minutes/22222222-2222-4222-8222-22222222b501/c5bc344b-c374-4a9f-a2fe-a6f5211375f1/<random-uuid>-qualification.txt
Content-Type: text/plain
Authorization: Bearer <fictional-isolated-user-token-redacted>
apikey: <isolated-publishable-key-redacted>

fictional qualification attachment
```

Preserved response evidence:

```text
HTTP 403
new row violates row-level security policy
```

That exact status/message pair is the full response detail preserved by the earlier run. A JSON envelope, request token, and generated object UUID were not retained and are not reconstructed here. The script stopped at the first upload, so sign/read/update/delete results are not claimed.

Source: `scripts/test-official-attachment-storage.mjs` and [the original qualification record](sol-review-repair-20260926.md).

## SQL mutation record and verbatim errors

No owner-only policy/ACL mutation was executed through the current `postgres` connector after the owner mismatch was established. The qualification record says the failed privilege path was not retried, but it does **not** preserve an exact mutable SQL statement paired with a server error. Consequently, there is no evidence-based verbatim SQL error to supply, and this package does not invent one or create a new failure merely for the ticket.

The exact proposed owner transaction is attached separately as [storage-owner-repair-nisipxbuvndobyxqqglf.sql](storage-owner-repair-nisipxbuvndobyxqqglf.sql). It is proposed SQL, not represented as previously executed SQL. Its first guard would reject a non-owner with the script-defined message below, but that message is also not represented as a captured server response:

```text
VC_STORAGE_OWNER_REQUIRED: current_user=postgres; expected supabase_storage_admin
```

This distinction matters: the captured runtime failure is the Storage API `403`; the missing SQL capability is established by catalog readback.

## Fresh read-only catalog readback — 2026-09-28

Execution identity:

```text
current_user: postgres
session_user: postgres
pg_has_role(postgres, supabase_storage_admin, MEMBER): false
```

Managed owners:

| table | owner |
|---|---|
| `storage.buckets` | `supabase_storage_admin` |
| `storage.buckets_analytics` | `supabase_storage_admin` |
| `storage.objects` | `supabase_storage_admin` |

Candidate helper:

```text
signature: storage_group_documents_authorized(text,text)
return type: boolean
owner: postgres
security definer: true
function config: search_path=""
authenticated EXECUTE: true
anon EXECUTE: false
service_role EXECUTE: false
```

Required `storage.objects` policies:

```text
gdocs_select_group: absent
gdocs_insert_group: absent
gdocs_update_group: absent
gdocs_delete_group: absent
```

Effective `TRUNCATE` capability:

| role | `storage.objects` | `storage.buckets` | `storage.buckets_analytics` |
|---|---:|---:|---:|
| `anon` | true | true | true |
| `authenticated` | true | true | true |
| `service_role` | true | true | true |
| `postgres` | true | true | true |
| `supabase_storage_admin` | true | true | true |

Explicit ACL readback shows `supabase_storage_admin` as grantor for `anon`, `authenticated`, and `service_role` on all three tables. It is also the grantor for `postgres` on `storage.objects` and `storage.buckets`. No explicit `PUBLIC` `TRUNCATE` ACL row was returned. The owner transaction still revokes from `PUBLIC` defensively and from `anon`/`authenticated` explicitly.

The read-only query used `pg_class`, `pg_namespace`, `pg_proc`, `pg_policy`, `has_table_privilege`, `pg_has_role`, and `aclexplode`. It read no Storage object contents, application records, credentials, or secrets.

The full sanitized result set is [supabase-SU-487325-storage-readback-20260928.json](supabase-SU-487325-storage-readback-20260928.json).

## Required provider action

Execute [storage-owner-repair-nisipxbuvndobyxqqglf.sql](storage-owner-repair-nisipxbuvndobyxqqglf.sql) only on `nisipxbuvndobyxqqglf` as `supabase_storage_admin` or through Supabase's supported equivalent managed-table owner capability, then return all five readback result sets. Do not change ownership.

After that readback passes, Daybreak Blue will run the existing real upload/sign/read/update/delete actor matrix, including immutable official attachments and tenant/permission denials. Until then Storage remains the external release gate.
