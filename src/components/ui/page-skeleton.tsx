"use client";

import { cn } from "@/lib/utils";

function Shimmer({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-lg bg-muted", className)} />
  );
}

/** Dashboard-style skeleton with stat cards and table */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-6 space-y-3">
            <Shimmer className="h-4 w-24" />
            <Shimmer className="h-8 w-16" />
            <Shimmer className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border p-6 space-y-4">
        <Shimmer className="h-5 w-40" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Shimmer className="h-10 w-10 rounded-full" />
            <Shimmer className="h-4 w-32" />
            <Shimmer className="ml-auto h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** List/table skeleton */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Shimmer className="h-8 w-48" />
        <Shimmer className="h-10 w-32 rounded-md" />
      </div>
      <div className="rounded-xl border divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <Shimmer className="h-10 w-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Shimmer className="h-4 w-36" />
              <Shimmer className="h-3 w-24" />
            </div>
            <Shimmer className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Card grid skeleton */
export function CardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Shimmer className="h-8 w-48" />
        <Shimmer className="h-10 w-32 rounded-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="rounded-xl border p-6 space-y-3">
            <Shimmer className="h-10 w-10 rounded-xl" />
            <Shimmer className="h-5 w-32" />
            <Shimmer className="h-3 w-full" />
            <Shimmer className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Generic empty state */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Error state */
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-900/20 mb-4">
        <svg className="h-8 w-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold">Something went wrong</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message || "Failed to load data. Please try again."}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Retry
        </button>
      )}
    </div>
  );
}
