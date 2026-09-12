import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { psql, root } from "./_cut2_test_helpers.mjs";

test("each of 17 WA uniques is provenance-scoped", () => {
  const matrix = JSON.parse(fs.readFileSync(new URL("../docs/evidence/S0_CUT2_LEGACY_WA_INDEX_PROVENANCE_MATRIX_20260911.json", import.meta.url), "utf8"));
  assert.equal(matrix.indexes.length, 17);
  for (const ix of matrix.indexes) {
    const def = psql(`SELECT indexdef FROM pg_indexes WHERE indexname='${ix.index_name}';`);
    const prefix = ix.old_exact_indexdef.split(" WHERE ")[0];
    const pg16 = `${prefix} WHERE (${ix.old_where_body_without_outer_parens} AND (cut2_provenance_version = 1))`;
    assert.ok(
      def === ix.future_exact_indexdef || def === pg16,
      `${ix.index_name} drift: ${def}`,
    );
    assert.match(def, /cut2_provenance_version = 1/);
  }
});
