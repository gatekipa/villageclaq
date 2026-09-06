/** Read every authorized row; a failed page must never become a partial total.
 * The caller supplies tenant/member filters and a deterministic, unique order.
 * Continue until an empty page because the server may cap below our page size.
 */
export async function readAllPages<T>(
  read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (;;) {
    const { data, error } = await read(rows.length, rows.length + pageSize - 1);
    if (error) throw new Error("Financial records could not be loaded completely.");
    if (!data) throw new Error("Financial records response was incomplete.");
    if (data.length === 0) return rows;
    rows.push(...data);
  }
}
