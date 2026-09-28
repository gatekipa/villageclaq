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

test("member import is explicitly CSV-only in EN and FR", () => {
  assert.match(membersPage, /accept="\.csv"/);
  assert.match(membersPage, /villageclaq-member-import-template\.csv/);
  assert.doesNotMatch(membersPage, /accept="[^"]*\.xlsx/);
  assert.match(en.members.dragOrClick, /CSV only/i);
  assert.match(en.members.dragOrClick, /\.xlsx files are not supported/i);
  assert.match(fr.members.dragOrClick, /CSV uniquement/i);
  assert.match(fr.members.dragOrClick, /\.xlsx ne sont pas pris en charge/i);
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
  assert.match(membersPage, /\["sms", "whatsapp"\]\.map/);
  assert.match(membersPage, /navigator\.clipboard\.writeText\(claimUrl\)/);
  assert.match(membersPage, /setClaimSuccess\(queued \? t\("claimInviteQueued"\) : t\("claimInviteLinkReady"\)\)/);
  assert.match(claimRoute, /\(\["whatsapp", "sms"\] as const\)\.filter\(\(c\) => requested\.has\(c\)\)/);
  assert.match(claimRoute, /claimUrl/);
});
