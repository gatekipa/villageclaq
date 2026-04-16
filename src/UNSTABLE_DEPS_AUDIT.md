# Unstable Dependency Audit

**Date:** 2026-04-16
**Trigger:** Infinite user fetch loop (331 req/min) after "Start free trial" redirect

## Root Cause (Fixed in previous commit)

`useSearchParams()` returns a new `URLSearchParams` object on every render.
It was in `fetchData`'s `useCallback` dependency array in `group-context.tsx`,
causing `fetchData` to get a new reference every render, which triggered two
`useEffect` hooks every render, each calling `supabase.auth.getUser()`.

## Full Codebase Findings

| # | File | Line | Pattern | Risk | Status |
|---|------|------|---------|------|--------|
| 1 | `src/lib/group-context.tsx` | 220 | searchParams in useCallback deps | CRITICAL | FIXED (prev commit) |
| 2 | `src/app/[locale]/(dashboard)/layout.tsx` | 366 | router in useEffect deps | HIGH | FIXED (prev commit) |
| 3 | `src/app/[locale]/(dashboard)/dashboard/members/page.tsx` | 906 | searchParams in useEffect deps | HIGH | FIXED (this commit) |
| 4 | `src/lib/hooks/use-require-admin.ts` | 20 | router in useEffect deps | HIGH | FIXED (this commit) |
| 5 | `src/app/[locale]/admin/layout.tsx` | 115 | router in useEffect deps | MEDIUM | FIXED (this commit) |
| 6 | `src/lib/hooks/use-supabase-query.ts` | 165 | object in queryKey (filters) | HIGH | FIXED (this commit) |
| 7 | `src/components/ui/scroll-to-top-on-nav.tsx` | 12 | pathname in deps | LOW | SAFE (string primitive) |

## Patterns Audited (No Issues Found)

- **Auth state listeners**: Only one in `group-context.tsx`, has proper `subscription.unsubscribe()` cleanup, guards with `initialLoadDone` and `userRef`
- **refetch/invalidateQueries in useEffect**: None found in effects — all in click handlers or mutation callbacks
- **setState loops**: No effect sets a state variable that's also in its own deps
- **Supabase realtime**: No `.channel().subscribe()` patterns found
- **Inline objects in deps**: No useEffect/useCallback/useMemo has inline objects in dependency arrays
- **TanStack Query config**: `staleTime: 60_000`, `refetchOnWindowFocus: false` — reasonable defaults

## Fix Patterns Applied

### For useSearchParams():
```tsx
// BAD — new object every render
const searchParams = useSearchParams();
useEffect(() => { ... }, [searchParams]);

// GOOD — extract primitive string
const searchParams = useSearchParams();
const myParam = searchParams.get("myKey");
useEffect(() => { ... }, [myParam]);

// GOOD — use stable hook
const { get } = useStableSearchParams();
```

### For useRouter():
```tsx
// BAD — new object every render
const router = useRouter();
useEffect(() => { router.push(...) }, [router]);

// GOOD — ref pattern
const router = useRouter();
const routerRef = useRef(router);
routerRef.current = router;
useEffect(() => { routerRef.current.push(...) }, []);

// GOOD — use stable hook
const router = useStableRouter();
```

### For queryKey with objects:
```tsx
// BAD — new object reference every render
queryKey: ["data", groupId, filters]

// GOOD — extract primitives
queryKey: ["data", groupId, filters?.status ?? "", filters?.id ?? ""]
```

## Safeguard Hooks Created

| Hook | File | Purpose |
|------|------|---------|
| `useStableSearchParams()` | `src/lib/hooks/use-stable-search-params.ts` | Returns memoized search params that only change when URL changes |
| `useSearchParam(name)` | `src/lib/hooks/use-stable-search-params.ts` | Returns a single param as a stable string |
| `useStableRouter()` | `src/lib/hooks/use-stable-router.ts` | Returns router with stable method references |
| `useThrottledCallback(fn, ms)` | `src/lib/hooks/use-throttled-callback.ts` | Wraps any callback with a cooldown period |
