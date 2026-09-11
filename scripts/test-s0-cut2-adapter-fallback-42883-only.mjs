import assert from "node:assert/strict";
import test from "node:test";
import { read } from "./_cut2_test_helpers.mjs";

function matchesFrozenMissingRpcIdentity(err) {
  const code = String(err.code || "");
  const msg = String(err.message || "").toLowerCase();
  const codeOk = code === "42883" || code === "PGRST202";
  const msgOk =
    msg.includes("enqueue_outbound_notification") &&
    (msg.includes("does not exist") || msg.includes("could not find the function"));
  return codeOk && msgOk;
}

test("matcher identity remains exact 42883/PGRST202; production fail-closed / no INSERT", () => {
  const src = read("src/lib/enqueue-outbound-notification.ts");
  assert.match(src, /42883/);
  assert.match(src, /PGRST202/);
  assert.match(src, /enqueue_outbound_notification/);
  assert.match(src, /does not exist/);
  assert.match(src, /could not find the function/);
  assert.match(src, /FAIL CLOSED/);
  assert.doesNotMatch(src, /\.from\(["']notifications_queue["']\)\s*\.insert/);
  assert.equal(
    matchesFrozenMissingRpcIdentity({
      code: "42883",
      message: "function enqueue_outbound_notification does not exist",
    }),
    true,
  );
  assert.equal(
    matchesFrozenMissingRpcIdentity({
      code: "PGRST202",
      message: "Could not find the function enqueue_outbound_notification",
    }),
    true,
  );
  assert.equal(
    matchesFrozenMissingRpcIdentity({ code: "42501", message: "enqueue_outbound_notification permission" }),
    false,
  );
  assert.equal(
    matchesFrozenMissingRpcIdentity({ code: "23505", message: "enqueue_outbound_notification duplicate" }),
    false,
  );
  assert.equal(
    matchesFrozenMissingRpcIdentity({ code: "42883", message: "other function does not exist" }),
    false,
  );
});
