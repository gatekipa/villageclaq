"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function ProfileAbuseReport({ slug }: { slug: string }) {
  const t = useTranslations("publicProfile");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("misrepresentation");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || details.trim().length < 10) return;
    setBusy(true);
    setError(false);
    const { error: submitError } = await createClient().rpc(
      "submit_public_profile_abuse_report", {
        p_slug: slug,
        p_reason: reason,
        p_details: details.trim(),
      },
    );
    setBusy(false);
    if (submitError) setError(true);
    else setDone(true);
  }

  if (done) return <p role="status" className="text-sm text-gray-600">{t("reportReceived")}</p>;
  if (!open) return (
    <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
      {t("reportPage")}
    </Button>
  );
  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-md space-y-3 rounded-lg border bg-white p-4 text-left">
      <h2 className="font-semibold">{t("reportPage")}</h2>
      <label className="block text-sm" htmlFor="profile-report-reason">{t("reportReason")}</label>
      <select id="profile-report-reason" className="w-full rounded-md border p-2" value={reason}
        onChange={(event) => setReason(event.target.value)}>
        <option value="misrepresentation">{t("reportMisrepresentation")}</option>
        <option value="harassment">{t("reportHarassment")}</option>
        <option value="other">{t("reportOther")}</option>
      </select>
      <label className="block text-sm" htmlFor="profile-report-details">{t("reportDetails")}</label>
      <textarea id="profile-report-details" className="min-h-24 w-full rounded-md border p-2"
        value={details} maxLength={1000} required minLength={10}
        onChange={(event) => setDetails(event.target.value)} />
      {error && <p role="alert" className="text-sm text-red-700">{t("reportFailed")}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || details.trim().length < 10}>
          {t("reportSubmit")}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          {t("reportCancel")}
        </Button>
      </div>
    </form>
  );
}
