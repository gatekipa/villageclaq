"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Status = "new" | "in_progress" | "resolved";
type Enquiry = {
  id: string; name: string; email: string; subject: string | null;
  message: string; status: Status; reply: string | null; created_at: string;
};

export default function EnquiryInbox() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [reply, setReply] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const client = createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) { setError(true); setLoading(false); return; }
    const { data, error: readError } = await fetchAllRows((from, to) => client
      .from("contact_enquiries")
      .select("id,name,email,subject,message,status,reply,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to));
    setRows((data ?? []) as Enquiry[]);
    setError(Boolean(readError));
    setLoading(false);
  }, []);

  useEffect(() => {
    const request = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(request);
  }, [refresh]);

  const handle = async (row: Enquiry) => {
    setBusy(row.id);
    const client = createClient();
    const { error: writeError } = await client.rpc("handle_designated_enquiry", {
      p_enquiry_id: row.id,
      p_status: status[row.id] ?? row.status,
      p_reply: reply[row.id]?.trim() || null,
    });
    setError(Boolean(writeError));
    setBusy(null);
    if (!writeError) { setReply((current) => ({ ...current, [row.id]: "" })); await refresh(); }
  };

  const copy = locale === "fr"
    ? { note: "La réponse est conservée dans le dossier. Aucun courriel n'est envoyé.", error: "Accès refusé ou erreur de chargement.", empty: "Aucune demande.", loading: "Chargement…", save: "Enregistrer" }
    : { note: "The reply is saved in the record. No email is sent.", error: "Access denied or unable to load enquiries.", empty: "No enquiries.", loading: "Loading…", save: "Save" };

  return <main className="mx-auto max-w-3xl space-y-5 p-6">
    <h1 className="text-3xl font-bold">{t("enquiries")}</h1>
    <p className="text-sm text-muted-foreground">{copy.note}</p>
    {loading && <p>{copy.loading}</p>}
    {error && <p role="alert" className="text-destructive">{copy.error}</p>}
    {!loading && !error && rows.length === 0 && <p>{copy.empty}</p>}
    {!loading && !error && rows.map((row) => <Card key={row.id}><CardContent className="space-y-3 p-5">
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="font-semibold">{row.subject}</h2>
        <span className="text-sm">{row.status} · {row.created_at.slice(0, 10)}</span>
      </div>
      <p className="text-sm">{row.name} · {row.email}</p>
      <p className="whitespace-pre-wrap">{row.message}</p>
      {row.reply && <p className="whitespace-pre-wrap text-sm">{t("reply")}: {row.reply}</p>}
      <label className="block text-sm" htmlFor={`status-${row.id}`}>{t("changeStatus")}</label>
      <select id={`status-${row.id}`} className="rounded border p-2" value={status[row.id] ?? row.status}
        onChange={(event) => setStatus((current) => ({ ...current, [row.id]: event.target.value as Status }))}>
        <option value="new">{t("statusNew")}</option>
        <option value="in_progress">{t("statusInProgress")}</option>
        <option value="resolved">{t("statusResolved")}</option>
      </select>
      <label className="block text-sm" htmlFor={`reply-${row.id}`}>{t("reply")}</label>
      <Textarea id={`reply-${row.id}`} value={reply[row.id] ?? ""} maxLength={5000}
        onChange={(event) => setReply((current) => ({ ...current, [row.id]: event.target.value }))} />
      <Button disabled={busy === row.id} onClick={() => void handle(row)}>{copy.save}</Button>
    </CardContent></Card>)}
  </main>;
}
