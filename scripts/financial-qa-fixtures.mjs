// Local-only synthetic Supabase-shaped fixture. No upstream requests or writes.
import http from "node:http";
const port = Number(process.env.FINANCIAL_QA_PORT || 4319);
const uid = "00000000-0000-4000-8000-000000000001";
const gid = "00000000-0000-4000-8000-000000000002";
const tid = "00000000-0000-4000-8000-000000000003";
const type2 = "00000000-0000-4000-8000-000000000004";
const group = { id: gid, name: "Financial QA Association", group_type: "association", currency: "USD", locale: "en", is_active: true, created_by: uid, settings: {}, group_level: "standalone" };
const user = { id: uid, aud: "authenticated", role: "authenticated", email: "qa@example.invalid", created_at: "2026-01-01", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {} };
const profile = { id: uid, full_name: "QA Treasurer", display_name: "QA Treasurer", preferred_locale: "en", phone: "***857" };
const members = ["QA Treasurer", "Alexandra Verylongname Financial Reconciliation Tester", "QA Unpaid Member"].map((name, i) => ({
  id: `00000000-0000-4000-8000-${String(10 + i).padStart(12, "0")}`,
  user_id: i ? null : uid, group_id: gid, role: i ? "member" : "owner", standing: "good",
  membership_status: "active", display_name: name, is_proxy: !!i, joined_at: "2026-01-01",
  group, profiles: { ...profile, full_name: name, display_name: name }, profile: { ...profile, full_name: name },
}));
const types = [
  { id: tid, name: "Annual Membership Contributions and Community Development", name_fr: "Cotisations annuelles et développement communautaire", amount: 100, currency: "USD", frequency: "annual", is_active: true, group_id: gid, due_day: 1, start_date: "2026-09-01", enroll_all_members: true },
  { id: type2, name: "Future Special Contribution", name_fr: "Cotisation exceptionnelle à venir", amount: 50, currency: "USD", frequency: "one_time", is_active: true, group_id: gid, start_date: "2026-12-01" },
];
const obligations = members.map((member, i) => ({
  id: `o${i}`, group_id: gid, membership_id: member.id, contribution_type_id: tid,
  amount: 100, amount_paid: 0, status: "pending", currency: "USD", due_date: "2026-09-01", period_label: "2026", contribution_type: types[0], membership: member,
})).concat([{ id: "future", group_id: gid, membership_id: members[0].id, contribution_type_id: type2, amount: 50, amount_paid: 0, status: "pending", currency: "USD", due_date: "2026-12-01", period_label: "2026", contribution_type: types[1], membership: members[0] }]);
const amounts = [40, ...Array(12).fill(5), 40, 25, 99];
const payments = amounts.map((amount, i) => {
  const m = members[i < 13 ? 0 : i === 13 ? 1 : 2];
  return { id: `p${String(i).padStart(4, "0")}`, group_id: gid, membership_id: m.id, contribution_type_id: tid, obligation_id: null,
    relief_plan_id: null, amount, currency: "USD", status: i === 14 ? "pending_confirmation" : i === 15 ? "rejected" : "confirmed",
    recorded_at: `2026-09-${String(i + 1).padStart(2, "0")}T12:00:00Z`, created_at: "2026-09-01",
    payment_method: i % 2 ? "cash" : "bank_transfer", reference_number: `QA-${i}`, membership: m, contribution_type: types[0] };
});
const token = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: uid, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 86400 })).toString("base64url"),
  "synthetic-not-a-real-signature"].join(".");
const session = { access_token: token, refresh_token: "synthetic-only", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user };
let blockedWrites = 0;
http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (!["GET", "HEAD"].includes(req.method)) { blockedWrites++; res.writeHead(405); return res.end(JSON.stringify({ message: "Fixture is read-only" })); }
  if (url.pathname === "/__qa/session") return res.end(JSON.stringify({ cookie: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url") }));
  if (url.pathname === "/__qa/status") return res.end(JSON.stringify({ blockedWrites, realSends: 0, upstreamRequests: 0 }));
  if (url.pathname === "/auth/v1/user") return res.end(JSON.stringify(user));
  let rows = [];
  const table = url.pathname.split("/").at(-1);
  if (table === "profiles") rows = [profile];
  if (table === "groups") rows = [group];
  if (table === "memberships") rows = members;
  if (table === "payments") rows = payments;
  if (table === "contribution_obligations") rows = obligations;
  if (table === "contribution_types") rows = types;
  for (const [key, val] of url.searchParams) {
    if (val.startsWith("eq.")) rows = rows.filter(r => String(r[key]) === val.slice(3));
    if (val.startsWith("neq.")) rows = rows.filter(r => String(r[key]) !== val.slice(4));
  }
  const order = url.searchParams.get("order");
  if (order) rows = [...rows].sort((a, b) => {
    for (const clause of order.split(",")) {
      const [field, direction] = clause.split(".");
      const c = String(a[field] ?? "").localeCompare(String(b[field] ?? ""));
      if (c) return direction === "desc" ? -c : c;
    }
    return 0;
  });
  const total = rows.length;
  const offset = Number(url.searchParams.get("offset") || 0);
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 100);
  rows = rows.slice(offset, offset + limit);
  res.setHeader("Content-Range", total ? `${offset}-${offset + rows.length - 1}/${total}` : "*/0");
  if (req.method === "HEAD") return res.end();
  res.end(JSON.stringify(String(req.headers.accept).includes("vnd.pgrst.object") ? rows[0] ?? null : rows));
}).listen(port, "127.0.0.1", () => console.log(`Synthetic read-only fixture on http://127.0.0.1:${port}`));
