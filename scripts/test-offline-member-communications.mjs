import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const membersPage = read("src/app/[locale]/(dashboard)/dashboard/members/page.tsx");
const paymentCron = read("src/app/api/cron/payment-reminders/route.ts");
const announcementRoute = read("src/app/api/announcements/enqueue/route.ts");
const claimRoute = read("src/app/api/proxy-claim/send/route.ts");
const en = JSON.parse(read("messages/en.json"));
const fr = JSON.parse(read("messages/fr.json"));

test("member import explicitly supports CSV and native XLSX in EN and FR", () => {
  assert.match(membersPage, /accept="\.csv,\.xlsx"/);
  assert.match(membersPage, /villageclaq-member-import-template\.csv/);
  assert.match(membersPage, /villageclaq-member-import-template\.xlsx/);
  assert.match(en.members.dragOrClick, /\.csv or \.xlsx/i);
  assert.match(en.members.dragOrClick, /text-formatted phone/i);
  assert.match(fr.members.dragOrClick, /\.csv ou \.xlsx/i);
  assert.match(fr.members.dragOrClick, /format Texte/i);
});

test("offline contribution and announcement candidates require active membership, consent, and contact", () => {
  for (const source of [paymentCron, announcementRoute]) {
    assert.doesNotMatch(source, /\.not\("user_id", "is", null\)/);
    assert.match(source, /proxy_contact_consent === true/);
    assert.match(source, /proxy_phone \|\| privacy\.proxy_email/);
  }
  assert.match(paymentCron, /producePaymentReminderNotification\(supabase, o\.id as string/);
  assert.match(announcementRoute, /enqueueCut2ProducerChannels/);
  assert.match(announcementRoute, /recipientMembershipId: m\.id as string/);
});

test("manual activation has an explicit queue action and a copyable link fallback", () => {
  assert.match(membersPage, /onClick=\{handleSendClaimInvite\}/);
  assert.match(membersPage, /\["email", "sms", "whatsapp"\]\.map/);
  assert.match(membersPage, /navigator\.clipboard\.writeText\(claimUrl\)/);
  assert.match(membersPage, /setClaimSuccess\(queued \? t\("claimInviteQueued"\) : t\("claimInviteLinkReady"\)\)/);
  assert.match(claimRoute, /\(\["email", "whatsapp", "sms"\] as const\)\.filter\(\(c\) => requested\.has\(c\)\)/);
  assert.match(claimRoute, /claimUrl/);
});
