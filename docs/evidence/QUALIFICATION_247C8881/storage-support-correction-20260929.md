# SU-487325 Storage correction and isolated actor check — 2026-09-29

Target: isolated Supabase branch `nisipxbuvndobyxqqglf`. Production `llbnliixczcqfftxpsmb` remained read only. Application candidate: `35637fc50d9698e4e93a0b749f722096b3ba2044`. The worktree began clean at `ec5c31a0daed402882e57a8b83c2666b004a6a39`.

Supabase Support confirmed that the missing four `gdocs_*` policies explain the upload failure and can be restored with customer-accessible policy/SQL tooling. Support also classified the managed Storage `TRUNCATE` grants as standard platform permissions. The earlier proposed owner SQL and its `TRUNCATE` revocation/failure guard were **not executed**. Its claim that revocation is a release gate is superseded. No managed-table ownership or grants changed.

The branch catalog initially had zero `storage.objects` policies. `group-documents` existed and was private. `public.storage_group_documents_authorized(text,text)` existed as a `postgres`-owned security-definer function with empty `search_path`, `authenticated` EXECUTE, and no `anon` or `service_role` EXECUTE. Its referenced parent tables existed. The current helper from `00194` restricts keys by group, parent row, state and operation; official minutes and constitution bytes cannot be updated or deleted out of band.

Using the Supabase customer migration API on the isolated project, Daybreak applied **only** the four `CREATE POLICY` statements from `00116` as additive migration `20260929210053 restore_gdocs_policies_isolated_20260929`. No existing migration row was edited. Readback from `pg_policies` returned exactly four `storage.objects` policies, all `TO authenticated` and all requiring `bucket_id = 'group-documents'`:

Exact submitted SQL (branch-only repair record; policies already exist, so do not replay unchanged):

```sql
CREATE POLICY "gdocs_select_group" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'group-documents'
    AND public.storage_group_documents_authorized(name, 'select'));
CREATE POLICY "gdocs_insert_group" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'group-documents'
    AND public.storage_group_documents_authorized(name, 'insert'));
CREATE POLICY "gdocs_update_group" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'group-documents'
    AND public.storage_group_documents_authorized(name, 'update'))
  WITH CHECK (bucket_id = 'group-documents'
    AND public.storage_group_documents_authorized(name, 'update'));
CREATE POLICY "gdocs_delete_group" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'group-documents'
    AND public.storage_group_documents_authorized(name, 'delete'));
```

| Policy | Command | Helper operation | Check |
|---|---|---|---|
| `gdocs_select_group` | SELECT | `select` | USING |
| `gdocs_insert_group` | INSERT | `insert` | WITH CHECK |
| `gdocs_update_group` | UPDATE | `update` | USING and WITH CHECK |
| `gdocs_delete_group` | DELETE | `delete` | USING |

Real Supabase Storage API matrix, signed in as the isolated fictional founder owner and ordinary member:

| Actor/state | Action | Result |
|---|---|---|
| Owner, new fictional draft | Upload, authoritative attach, sign and fetch bytes | PASS; fetched 55 bytes exactly matched the submitted content |
| Ordinary member, draft | Sign; upload to same parent | DENIED (`Object not found`; RLS violation) |
| Owner, attached draft | Replace bytes; delete | Replace DENIED by RLS. Delete returned an empty list without error; subsequent signed fetch and catalog readback proved object and original bytes persisted. |
| Ordinary member, published | Sign and fetch bytes | PASS; exact content matched |
| Owner/member, nonexistent foreign group key | Upload/sign | DENIED (RLS violation / `Object not found`) |
| Ordinary member after owner-signed suspension | Sign and direct download | DENIED (`Object not found`); owner restored member to active in the same run |
| Ordinary member after withdrawal | Sign | DENIED; owner retained signed read |

Persistent readback: Storage object `7d500260-7acf-4db8-9f57-bd8514afc20a` remains in `group-documents` at `minutes/19909390-7269-4c86-8eda-fdbc6640ccf8/5f3e137e-5e9b-41aa-8bab-a2cc7a5379a7/3aadf13b-f2b8-4ba3-ba72-558407165e13-fictional-storage.txt`, metadata size 55. Minutes row `5fd0994c-e90a-4c1b-869f-87a6c8c11f9c` retains the exact object link and `withdrawn` status. Audit actions `minutes.save_draft`, `minutes.attach`, `minutes.publish`, and `minutes.withdraw` persisted. The tested member's final lifecycle state is `active`. The fictional record and object remain as qualification evidence.

For a stronger **existing foreign-group** boundary, the owner created a second clearly labeled fictional group `07886294-5d3f-484f-8fd1-34727ca449c4` through the normal organization/group/owner-membership path. Its published minutes record `15ffb0d5-aee1-4d4a-88e7-b48b1869add5` and 33-byte object `9ed6ae85-75d9-49cd-a407-11dbfb5e1fe2` persist with the exact document key. The owner could sign and fetch the exact bytes. The first group's ordinary member had **zero memberships** in the second group and was denied sign, direct download, and upload there (`Object not found` / RLS violation). The group is marked `qualification_only` and retained as fictional evidence; no existing founder record was removed.

This closes the actual Storage API policy gate for the tested minutes attachment path. The historical support packet's owner-only premise is superseded. The separate future-branch migration reproducibility issue remains tracked in `BUILD_STATUS.md`; this policy repair did not reset or rebuild the branch.
