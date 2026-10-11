/** Match the standing calculation: excused records do not enter the rate. */
export function attendanceRate(
  records: ReadonlyArray<{ status: unknown }>,
): number | null {
  const counted = records.filter((record) => record.status !== "excused");
  if (counted.length === 0) return null;
  const attended = counted.filter(
    (record) => record.status === "present" || record.status === "late",
  ).length;
  return Math.round((attended / counted.length) * 100);
}
