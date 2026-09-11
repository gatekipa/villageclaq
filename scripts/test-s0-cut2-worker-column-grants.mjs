import assert from "node:assert/strict";
import test from "node:test";
import { psql } from "./_cut2_test_helpers.mjs";

test("service_role UPDATE only worker columns; MUST NOT update immutables", () => {
  const cols = psql(`
    SELECT string_agg(privilege_type || ':' || column_name, ',' ORDER BY column_name)
      FROM information_schema.column_privileges
     WHERE table_schema='public' AND table_name='notifications_queue'
       AND grantee='service_role' AND privilege_type='UPDATE';
  `);
  const set = new Set(cols.split(",").filter(Boolean).map((s) => s.split(":")[1] || s.replace("UPDATE:","")));
  // psql may return UPDATE:col or just names depending on aggregate
  const granted = cols.toLowerCase();
  for (const ok of ["status", "error_message", "attempts", "sent_at", "data"]) {
    assert.match(granted, new RegExp(ok));
  }
  for (const bad of ["cut2_provenance_version", "channel", "template", "user_id", "created_at", "id"]) {
    const row = psql(`SELECT COALESCE(has_column_privilege('service_role','public.notifications_queue','${bad}','UPDATE'), false);`);
    assert.match(row, /f/);
  }
});
