import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { root } from "./_cut2_test_helpers.mjs";

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".git") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|mjs|js)$/.test(ent.name) && !ent.name.endsWith(".d.ts")) acc.push(p);
  }
  return acc;
}

test("no new provider send outside approved boundary", () => {
  const files = walk(path.join(root, "src"));
  const offenders = [];
  for (const f of files) {
    const rel = path.relative(root, f);
    const src = fs.readFileSync(f, "utf8");
    if (rel.includes("drain-notification-queue")) continue;
    if (rel.includes("send-whatsapp.ts")) continue;
    if (rel.includes("whatsapp-dispatcher.ts")) continue;
    if (rel.includes("sms-sender.ts")) continue;
    if (rel.includes("send-sms-notification.ts")) continue;
    if (rel.includes("send-email.ts")) continue;
    if (src.includes("AfricasTalking") || src.includes("graph.facebook.com")) {
      offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, []);
});
