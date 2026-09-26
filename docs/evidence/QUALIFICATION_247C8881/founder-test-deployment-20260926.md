# Founder-test deployment evidence — 2026-09-26

## Exact state

- Branch: `codex/qualification-repair-247c8881`
- Independently reviewed application repair: `792cf7002a46e13a0035534d3ac99a323f0726c9`
- Deployed application and founder safeguards: `cbe3a9fb5d46469614ba50250319b4f8620d7dad`
- Vercel production deployment: `dpl_8j2JAMtsjvCwEUZ9n3hBPZeS8RzS` (`villageclaq-kuxhd8j1x-gatekipas.vercel.app`)
- Verified source preview: `dpl_DiMnNsBN5ifKHndMp5GeC4LgU3fw` (`villageclaq-qhq27pl8h-gatekipas.vercel.app`)
- Public aliases: `https://villageclaq.com`, `https://www.villageclaq.com`
- Primary rollback deployment preserved: `dpl_GRkwD2GNFgDyMMa7yuJjKLyDc8fs` (`villageclaq-kqdwusq1o-gatekipas.vercel.app`)
- Pre-founder rollback also preserved: `dpl_4SpaTv78gATkwjHkwsYyJp14YyzP` (`villageclaq-31tumbnc8-gatekipas.vercel.app`)
- Supabase: isolated branch `nisipxbuvndobyxqqglf`, repository migrations through `00199`

## Configuration and behavioral checks

- Vercel Preview and Production values were replaced for browser URL/key, server key, application URL, and founder-test flags. Runtime `/api/founder-test/status` returned `bindingMatches=true`, `serviceCredentialVerified=true`, `externalDeliverySuppressed=true`, and `scheduledSideEffectsSuppressed=true` on the preview and public domain.
- `RESEND_API_KEY`, Africa's Talking, WhatsApp, Anthropic, `CRON_SECRET`, and payment-reminder variables were absent from the deployed Preview/Production configuration. Email, SMS and WhatsApp adapters also fail closed when `FOUNDER_TEST_MODE=true`.
- Supabase Auth has site URL `https://villageclaq.com` and allows `https://villageclaq.com/**` plus `https://www.villageclaq.com/**`. Custom SMTP is disabled; phone signup and confirmation are disabled. Founder mode additionally blocks Google OAuth, confirmation resend and password-recovery email entry points in the hosted UI.
- Local optimized build and Preview/Production Vercel builds passed. Focused ESLint had zero errors, non-incremental TypeScript and the provider-call boundary scan passed. The existing raw-Meta drain assertion remained red on the unchanged mock drain route; it was not caused by the deployment patch.
- Two fictional password accounts authenticate; no credentials appear in Git or this evidence. They are stored only in ignored local file `.vercel/founder-test-access.txt`.
- Browser: admin login reached the primary fictional group, then the same account switched from owner in that group to member in the second fictional group, with the available navigation changing accordingly.
- An authenticated non-service admin client updated the primary fictional group description and read back the result.
- Browser: French dashboard rendered at 390 × 844 with localized navigation and the persistent fictional-data banner.
- Public-domain recheck: `https://villageclaq.com/en/login` redirected to the canonical `www` host and returned 200; rendered login and recovery pages contained the founder guard; an existing fictional administrator session loaded the isolated-group dashboard after promotion. The public status endpoint returned all five expected true values and Vercel reported no error-level runtime logs after launch.
- Fixture payment configuration enables cash only and disables mobile money, bank transfer, Cash App, Zelle and Flutterwave.

## Founder paths available

- Administrator: login, choose either fictional group, inspect members and standing, record/test cash-only contributions, navigate Relief, minutes, constitution/bylaws, hierarchy, elections and the mounted growth surfaces supported by the tracker.
- Member: login, switch independent memberships, inspect member-facing standing, contributions, Relief, minutes, constitution/bylaws and available growth surfaces.
- Attachment upload/sign/read/update/delete remains unavailable until the provider-owned Storage policy work below is complete. Historical R-012 plans remain quarantined; use new fictional plans and transactions for founder testing.

## Open dependencies

- Storage API qualification is blocked before the actor matrix: isolated `storage.objects` has zero policies and the prior real upload returned RLS `403`. An authorized provider/managed-table owner must install the four production-equivalent `gdocs_select_group`, `gdocs_insert_group`, `gdocs_update_group`, and `gdocs_delete_group` policies calling `storage_group_documents_authorized(name, operation)`. The same owner must revoke `TRUNCATE` on isolated `storage.objects`, `storage.buckets`, and `storage.buckets_analytics` from `PUBLIC`, `anon`, and `authenticated`, then return effective policy and privilege evidence. Production Storage was not changed.
- R-012 legacy Relief records remain quarantined. They were neither deleted, activated, classified, nor given invented accounting entries. The finance owner still owns reconciliation.
- Full client-release qualification remains HOLD. This artifact is available for founder testing only.
