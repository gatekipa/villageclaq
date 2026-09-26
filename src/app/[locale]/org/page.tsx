"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type PublicOrganization = {
  slug: string;
  display_name: string;
  description: string | null;
  logo_url: string | null;
};

export default function PublicOrganizationDirectory() {
  const t = useTranslations("publicProfile");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<PublicOrganization[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    createClient().rpc("list_public_organization_profiles", {
      p_query: query,
      p_offset: offset,
      p_limit: 20,
    }).then(({ data, error: fetchError }) => {
      if (!active) return;
      setLoading(false);
      if (fetchError) { setError(true); return; }
      const page = (Array.isArray(data) ? data : []) as PublicOrganization[];
      setRows((previous) => offset === 0 ? page : [...previous, ...page]);
      setHasMore(page.length === 20);
    });
    return () => { active = false; };
  }, [query, offset]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRows([]);
    setOffset(0);
    setQuery(input.trim());
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-6 p-4 sm:p-8">
      <h1 className="text-2xl font-bold">{t("directoryTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("directoryDesc")}</p>
      <form onSubmit={search} className="flex gap-2">
        <label className="sr-only" htmlFor="organization-search">{t("directorySearch")}</label>
        <input id="organization-search" className="min-w-0 flex-1 rounded-md border p-2"
          value={input} onChange={(event) => setInput(event.target.value)}
          placeholder={t("directorySearch")} maxLength={80} />
        <Button type="submit">{t("directorySearchAction")}</Button>
      </form>
      {error && <p role="alert">{t("directoryError")}</p>}
      {!loading && !error && rows.length === 0 && <p>{t("directoryEmpty")}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((row) => (
          <Link key={row.slug} href={`/org/${row.slug}`}
            className="rounded-lg border p-4 focus-visible:outline-2 focus-visible:outline-primary">
            <h2 className="font-semibold">{row.display_name}</h2>
            {row.description && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
              {row.description}
            </p>}
          </Link>
        ))}
      </div>
      {loading && <p role="status">{t("loading")}</p>}
      {hasMore && !loading && <Button variant="outline" onClick={() => setOffset((value) => value + 20)}>
        {t("directoryMore")}
      </Button>}
    </main>
  );
}
