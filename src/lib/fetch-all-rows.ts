/**
 * PostgREST returns at most the project's max-rows setting per request
 * (Supabase default 1000) and silently drops the rest. Money totals must not
 * come from a truncated set, so page a stably ordered query (always include a
 * unique tiebreaker such as `id`) until every counted row has arrived. Request
 * `{ count: "exact" }` on the query: the count keeps paging correct even when
 * the server caps pages below `pageSize`.
 */
export const ROWS_PAGE_SIZE = 1000;

export type RowsPage<T> = {
  data: T[] | null;
  error: { message: string } | null;
  count?: number | null;
};

export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<RowsPage<T>>,
  pageSize: number = ROWS_PAGE_SIZE,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (;;) {
    const from = rows.length;
    const { data, error, count } = await fetchPage(from, from + pageSize - 1);
    if (error) return { data: rows, error };
    const page = data ?? [];
    rows.push(...page);
    const done = typeof count === "number"
      ? page.length === 0 || rows.length >= count
      : page.length < pageSize;
    if (done) return { data: rows, error: null };
  }
}
