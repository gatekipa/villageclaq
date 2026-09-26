# M14 legacy membership verifier boundary — 2026-09-26

**Executor:** Daybreak Blue. **Code:** `6966c818cb64d8873f716384eb586ab2da949d8d`. **Environment:** local Next dev server on `localhost:3017` bound to isolated Supabase branch `nisipxbuvndobyxqqglf`, fictional member `a801`; production remained read only. The branch service-role key is still a placeholder.

## Before

The mounted private `/dashboard/membership-card` created a QR/share URL from the raw membership UUID; the older `/dashboard/my-profile/card` encoded the membership and group UUIDs. Public `/verify/[code]` called `/api/verify?id=<code>`. That endpoint required no actor, used the service-role client to bypass RLS, and returned member name, group name, standing, join date and avatar for any known membership UUID. It did not check the M14 consented `community_share_cards` record or revocation. This is a material privacy bypass in the configured-service-key path. The local QA key placeholder made the before-browser unauthenticated call return 404 rather than disclosing a record; no actual browser disclosure is claimed. The old private card visibly offered a deterministic verification URL.

## Repair and focused verification

`/api/verify` now returns only `410 LEGACY_MEMBERSHIP_VERIFIER_RETIRED` with `Cache-Control: no-store`, independent of the service key or supplied UUID. An unauthenticated browser request for the fictional membership returned 410 and only the `error` key. The old `/fr/verify/<membership UUID>` page displayed the invalid-card state with no member fields. The old private-card bookmark now redirects to the current card route while retaining a validated route `group` parameter.

The current card no longer generates a membership-ID verification URL or QR, and its public-share button opens the existing M14 consented, opaque-token modal. At 390 px in the fictional FR session, the card back showed a protected-share prompt without a QR; the modal preview omitted the member name, consent was unchecked and Publish disabled. The existing M14 issuance, public projection and revocation evidence remains applicable because the M14 RPC and modal were not changed. No external share composer was opened. TypeScript, targeted ESLint and diff check passed after the repair.

The first local build hit a Windows lock in the dev server's `.next` directory. A separate ignored build directory avoided that collision; its first run could not fetch the app's existing Google Fonts under restricted network access. With authorized network access, the optimized Next 16.2.1 build passed: compiled, TypeScript, 46 static pages and both current/legacy card routes plus `/api/verify` present. Temporary `next.config.ts` and `tsconfig.json` edits were restored byte-for-byte; neither remains modified. Middleware, edge-static and metadataBase warnings remain advisory.

**Remaining M14:** verify approved image/link/API field parity, EN/FR mobile and keyboard flows, qualified election-summary publication, and full browser revocation of a newly issued card. This repair closes the demonstrated deterministic verifier path in the tested code, not the whole M14 acceptance matrix. Production remains HOLD; no deployment occurred.
