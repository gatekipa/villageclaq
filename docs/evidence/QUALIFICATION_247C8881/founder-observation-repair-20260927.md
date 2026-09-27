# Founder observation repair evidence — 2026-09-27

## Exact state

- Branch: `codex/qualification-repair-247c8881`
- Application candidate: `2213aadaa127c570730af264ec16057f81db5fd6`
- Isolated backend: `nisipxbuvndobyxqqglf`, migration history through `00203`
- Live domain remains on `cbe3a9fb5d46469614ba50250319b4f8620d7dad`; no production-domain promotion occurred in this batch.
- Existing Sol verdict remains PASS only for its reviewed scope at `792cf7002a46e13a0035534d3ac99a323f0726c9`; no review round was restarted.

## Focused results

- Member title persisted as `Test QA` after a fresh session. Ordinary peer and cross-tenant writes were denied.
- Member command matrix: ordinary member denied; active moderator allowed; revoked moderator denied; revoked self-edit denied. The final migration restores the approved owner/admin/moderator gate.
- Member table rendered one aligned column set with localized EN/FR role and lifecycle labels; 390 px browser width had no page overflow.
- The existing fictional contribution was preserved. EN and FR use the intended localized names. The cash account selector is usable after refreshing the stale isolated API binding. Founder receipt copy states that external delivery is disabled.
- Reminder settings saved `due_date_only` with `Africa/Douala`, survived a fresh session, denied ordinary and cross-group writers, rejected an invalid timezone, and created one authoritative audit event.
- Reminder eligibility tests: 5/5. Producer tests: 13/13. Before the due date, the manual route sent 0 and skipped 2; an ordinary member received 403. Delivery-time recheck claimed one fictional queue item, skipped it as `before_due_date`, produced zero provider dispatches, and left a `dead_letter` qualification record.
- Protected direct-link login preserved the contribution-record query and returned to exactly `/en/dashboard/contributions/record?...`, eliminating the reproduced `/en/en/...` 404.
- Final TypeScript/optimized Next.js build passed. Existing middleware and `metadataBase` warnings remain advisory.

## Preserved limits

- FQ-03 code repair is build-verified, but another contribution was not created solely to test it. Jude can perform one intended creation during the short preview acceptance.
- Existing invitation-integrity suite remains 8/9 because the unchanged invitations page does not yet map duplicate `23505` to the required result.
- The raw-Meta drain assertion still fails on the inherited mock dispatch route. Founder delivery remains suppressed; this result is not represented as provider-delivery qualification.
- Two archived fictional QA proxy artifacts remain visible because membership hard deletion is correctly prohibited. They are non-active fixture residue.
- Storage-owner work and the R-012 historical Relief quarantine remain unchanged release blockers.

## Preview delivery

- URL: `https://villageclaq-pfvarokrh-gatekipas.vercel.app`
- Deployment: `dpl_GRZJPeJjYj1ihz5DzmYMbaFke25A`, target `preview`, state `READY`
- Branch alias: `https://villageclaq-git-codex-qualification-repair-247c8881-gatekipas.vercel.app`
- Vercel access protection remains enabled. An authenticated `vercel curl` check returned founder-test mode, binding match, service credential verification, external-delivery suppression, and scheduled-side-effect suppression all `true`.
- `villageclaq.com` and `www.villageclaq.com` were not reassigned. Rollback remains the unchanged live deployment `dpl_8j2JAMtsjvCwEUZ9n3hBPZeS8RzS`, with preserved earlier rollback `dpl_GRkwD2GNFgDyMMa7yuJjKLyDc8fs`.