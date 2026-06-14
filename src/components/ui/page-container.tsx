import { cn } from "@/lib/utils";

/**
 * PageContainer — the single source of truth for dashboard content width.
 *
 * Fortune-500 SaaS apps cap their workspace content width and center it, so
 * pages don't stretch edge-to-edge on a 1920px+ monitor (which reads as
 * unfinished) while still giving data-dense tables/dashboards generous room.
 *
 * This is mounted ONCE inside the dashboard <main> wrapper (see
 * src/app/[locale]/(dashboard)/layout.tsx), so every dashboard route gets a
 * consistent max width and horizontal centering without each page hand-rolling
 * its own `max-w-* mx-auto`. It is a dumb, presentational wrapper — it adds NO
 * scroll container, NO padding (the <main> already owns `p-4 lg:p-6`), and NO
 * behavior.
 *
 * `fluid` opts a subtree out of the cap for genuinely full-bleed needs.
 */
export function PageContainer({
  children,
  fluid = false,
  className,
}: {
  children: React.ReactNode;
  /** Remove the max-width cap (full-bleed). Use sparingly. */
  fluid?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full",
        // 1600px is wide enough that data-dense admin tables still breathe,
        // but caps content on ultra-wide displays for a polished workspace feel.
        fluid ? "max-w-none" : "max-w-[1600px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
