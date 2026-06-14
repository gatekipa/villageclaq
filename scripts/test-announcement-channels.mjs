import assert from "node:assert/strict";
import test from "node:test";
import {
  getAnnouncementChannelDescriptors,
  getAnnouncementChannelDescriptor,
  isWhatsAppCategoryRestricted,
  hasExternalChannel,
  deriveAnnouncementStatus,
  announcementStatusLabelKey,
  announcementAuditAction,
  ANNOUNCEMENT_WHATSAPP_CATEGORY_RESTRICTED,
} from "../src/lib/announcement-channels.ts";

// Executable unit tests for the Build-7 announcement honesty truth model
// (Node 22 strips TS types on import — this verifies the ACTUAL logic, not
// just source text). Core invariant: the UI never claims more than the system
// can prove — status derives only from sent_at / scheduled_at / channels, and
// WhatsApp announcements are flagged category-restricted (Marketing / US-blocked).

// ── Channel descriptors ─────────────────────────────────────────────────────

test("in_app is always_on, not selectable, delivery-confirmable", () => {
  const d = getAnnouncementChannelDescriptor("in_app");
  assert.equal(d.availability, "always_on");
  assert.equal(d.selectable, false);
  assert.equal(d.deliveryConfirmable, true);
  assert.equal(d.warn, false);
});

test("external channels are never delivery-confirmable", () => {
  for (const k of ["email", "sms", "whatsapp"]) {
    const d = getAnnouncementChannelDescriptor(k);
    assert.equal(d.deliveryConfirmable, false, `${k} must not be delivery-confirmable`);
    assert.equal(d.selectable, true, `${k} must be selectable`);
  }
});

test("sms is limited (African numbers only) with a reason", () => {
  const d = getAnnouncementChannelDescriptor("sms");
  assert.equal(d.availability, "limited");
  assert.equal(d.reasonKey, "channelReasonSmsAfricaOnly");
});

test("WhatsApp announcement is category_restricted, warns, and is US-blocked", () => {
  assert.equal(isWhatsAppCategoryRestricted(), true);
  assert.equal(ANNOUNCEMENT_WHATSAPP_CATEGORY_RESTRICTED, true);
  const d = getAnnouncementChannelDescriptor("whatsapp");
  assert.equal(d.availability, "category_restricted");
  assert.equal(d.warn, true);
  assert.equal(d.deliveryConfirmable, false);
  assert.equal(d.reasonKey, "channelReasonWhatsappUsBlocked");
});

test("descriptor list is exactly the four announcement channels", () => {
  const keys = getAnnouncementChannelDescriptors().map((d) => d.key).sort();
  assert.deepEqual(keys, ["email", "in_app", "sms", "whatsapp"]);
});

// ── hasExternalChannel ──────────────────────────────────────────────────────

test("hasExternalChannel detects external channels only", () => {
  assert.equal(hasExternalChannel(["in_app"]), false);
  assert.equal(hasExternalChannel([]), false);
  assert.equal(hasExternalChannel(["in_app", "email"]), true);
  assert.equal(hasExternalChannel(["sms"]), true);
  assert.equal(hasExternalChannel(["whatsapp"]), true);
});

// ── deriveAnnouncementStatus truth table ────────────────────────────────────

test("status: draft when neither sent nor scheduled", () => {
  assert.equal(deriveAnnouncementStatus({ sent_at: null, scheduled_at: null }), "draft");
  assert.equal(deriveAnnouncementStatus({}), "draft");
});

test("status: scheduled when scheduled_at set and not yet sent", () => {
  assert.equal(
    deriveAnnouncementStatus({ sent_at: null, scheduled_at: "2026-07-01T00:00:00Z" }),
    "scheduled",
  );
});

test("status: published (in-app only) — never 'sent'/'delivered'", () => {
  assert.equal(
    deriveAnnouncementStatus({ sent_at: "2026-06-14T00:00:00Z", channels: ["in_app"] }),
    "published",
  );
  // sent_at wins over a stale scheduled_at
  assert.equal(
    deriveAnnouncementStatus({ sent_at: "2026-06-14T00:00:00Z", scheduled_at: "2026-06-13T00:00:00Z", channels: ["in_app"] }),
    "published",
  );
});

test("status: published_external when any external channel was requested", () => {
  for (const chans of [["in_app", "email"], ["in_app", "sms"], ["in_app", "whatsapp"], ["email"]]) {
    assert.equal(
      deriveAnnouncementStatus({ sent_at: "2026-06-14T00:00:00Z", channels: chans }),
      "published_external",
      `channels ${JSON.stringify(chans)} should derive published_external`,
    );
  }
});

test("status never invents delivered/failed/sent-to-provider", () => {
  const statuses = new Set();
  for (const row of [
    {}, { scheduled_at: "x" }, { sent_at: "x", channels: ["in_app"] }, { sent_at: "x", channels: ["whatsapp"] },
  ]) statuses.add(deriveAnnouncementStatus(row));
  for (const s of statuses) {
    assert.ok(["draft", "scheduled", "published", "published_external"].includes(s), `unexpected status ${s}`);
  }
});

// ── status label keys ───────────────────────────────────────────────────────

test("label keys map to honest i18n keys", () => {
  assert.equal(announcementStatusLabelKey("draft"), "draft");
  assert.equal(announcementStatusLabelKey("scheduled"), "scheduled");
  assert.equal(announcementStatusLabelKey("published"), "statusPublished");
  assert.equal(announcementStatusLabelKey("published_external"), "statusPublishedExternal");
});

// ── audit action honesty ────────────────────────────────────────────────────

test("audit action reflects the real state, not always 'sent'", () => {
  assert.equal(announcementAuditAction({ asDraft: true, scheduledForLater: false }), "announcement.created");
  assert.equal(announcementAuditAction({ asDraft: false, scheduledForLater: true }), "announcement.scheduled");
  assert.equal(announcementAuditAction({ asDraft: false, scheduledForLater: false }), "announcement.sent");
});
