# Membership, official records, and standing qualification — 2026-09-26

**Executor:** Daybreak Blue. **Tested application:** `56f00e76ba22ef42902da8c2e34e0f4d655b6373`. **Environment:** local Next.js application on `localhost:3017`, bound only to isolated Supabase branch `nisipxbuvndobyxqqglf`, using fictional users and suppressed external messaging. Production remained read only. The branch migration history records repository migrations through `00193` with matching names.

## Demonstrated defects and repairs

- Before `00190`, `anon` could execute join-code regeneration/increment helpers, and an authenticated actor could pass another user's ID to proxy claim. A rollback reproduction changed a foreign group's code/use count and claimed a proxy for a different user. A hierarchy membership trigger also rejected proxy rows because it attempted to persist a null person user ID.
- `00190` binds regeneration and proxy claims to the current actor and current authorization, removes ordinary access to legacy helpers, makes code joining serialized and server-audited, and defers hierarchy person creation until a proxy is claimed. `00191` makes same-actor replay return the existing membership even after a finite-use code reaches its cap.
- `00188` replaces consequential client writes for minutes and governing documents with replay-safe server commands, stable record/revision identity, durable Storage object keys, retained history, and atomic server audit. `00192` permits an audited retained withdrawal from draft as well as provisional/published state.
- `00189` separates calculated standing from effective standing and adds versioned override/revoke decisions. `00193` moves remaining roster and recalculation callers behind a replay-safe, current-authorized server command; the old direct standing update and best-effort client audit were removed.

## Hosted database evidence

- Effective function ACLs: `anon` cannot regenerate/use/increment codes or claim a proxy; `authenticated` can use only the supported join command. Cross-tenant regeneration and arbitrary-user proxy claim return `42501`.
- A matching invitation claimed its own proxy, accepted the invitation, and produced one authoritative audit. A one-use code created one membership and one audit; same-actor replay returned `already_member` with use count one. A separate pre-existing group membership remained active, proving independent group membership rather than a global role.
- Minutes probes pass draft/provisional/publish/supersede/withdraw, event deletion retention, request replay/payload conflict, current authorization, cross-tenant denial, immutable history, audit-failure rollback, and no duplicate success audit. A mounted minutes record retained as `withdrawn` has four completed command receipts and four matching server audit rows.
- Governing-document probes pass draft/publish/supersession, exact-revision acknowledgment, request conflict, revoked/cross-tenant denial, direct-write denial, prior-official retention on audit failure, and immutable revision history.
- Standing probes pass calculated/effective separation, reasoned override, expiry, revoke, replay/conflict, current authorization, direct-write denial, and audit-failure rollback. The new recalculation command separately passed replay, changed-payload conflict, current permission denial, and authoritative audit in a rollback probe.

## Mounted browser evidence

- At the narrow mobile viewport, English and French minutes show the retained lifecycle state as `Withdrawn` / `Retiré`; destructive delete wording is replaced with retained withdrawal wording.
- A fictional constitution was drafted, published as version 1, and acknowledged at that exact revision. The database shows one published revision, one exact-revision acknowledgment, three completed commands, and three authoritative audits.
- A fictional standalone minute was saved, published, and withdrawn. The mounted UI shows the retained record and the database shows status `withdrawn`. The notification route returned `401` with the intentionally invalid local service key, so no external enqueue succeeded.
- The French mobile roster saved a reasoned standing override for a fictional member. The mounted row changed to `À surveiller`; the database retained `calculated_standing=good`, `standing=warning`, one override decision, one completed command receipt, and one authoritative audit.

## Gates and limits

- `npx tsc -p tsconfig.json --noEmit`: pass.
- Focused ESLint: zero errors; 18 inherited warnings remain advisory.
- `node --test scripts/test-product-standing.mjs`: 30/30 pass.
- `npm run build`: pass using ignored `.vercel/next-qualification-final`; temporary `next.config.ts` and generated `tsconfig.json` changes were restored.

The real Storage upload/sign/replace browser matrix, full membership lifecycle/two-tab revocation matrix, remaining all-role/EN/FR/mobile matrices, R-012 historical cash classification, managed Storage `TRUNCATE` owner repair, valid isolated service key, and independent GPT-6 Sol review remain open. This evidence does not authorize production.
