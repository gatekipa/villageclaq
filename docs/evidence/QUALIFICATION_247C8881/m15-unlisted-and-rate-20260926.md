# M15 unlisted discovery and abuse caps — 2026-09-26

Executor: Daybreak Blue. Application code: `6966c818cb64d8873f716384eb586ab2da949d8d`. Local browser: `http://localhost:3017`, with `NEXT_PUBLIC_SUPABASE_URL` previously verified as the existing isolated Supabase branch `nisipxbuvndobyxqqglf`. All actors and groups here are fictional; no external messaging was invoked. This extends the prior M15 publication/request/unpublish evidence.

## Mounted unlisted and private behavior

The fictional HQ owner changed its existing profile from private to unlisted through the FR **Partage public** settings tab. The UI explained that anyone with the link can view an unlisted page, and showed save success. The direct `/fr/org/fictional-qualification-union` URL displayed only the approved display name, mission and website; it did not show a request action because requests were disabled. `/fr/org` displayed no organization, including after a search for `Fictional`. The owner restored visibility to private through the mounted settings. The database read showed `visibility=private`, and the formerly working direct URL then rendered “Organisation introuvable.” No profile remained publicly visible at the end of the probe.

## Isolated server cap probe

[`scripts/test-growth-publication-rate-limits.sql`](../../../scripts/test-growth-publication-rate-limits.sql) ran once on the isolated branch in a rollback transaction. An authorized fictional owner published a separate test profile. As `anon`, 100 distinct same-day membership requests were accepted; repeating the first address before the cap created no duplicate; request 101 raised `REQUEST_RATE_LIMITED`. Twenty-six abuse-report submissions retained exactly 25 records. The test asserted the group still had only its one original owner membership, then rolled back. The connector returned `M15_RATE_LIMIT_PASS`. A subsequent read found zero retained test groups and requests and confirmed the browser fixture was private.

This validates the current **per-group, per-day** database caps and same-day email deduplication. It does not establish network/IP throttling, abuse resistance across many groups or days, delivery of moderation notifications, EN keyboard behavior, or external search-engine cache expiration. Those remaining acceptance cases stay under VC-04/M15; no broad M15 PASS is claimed.
