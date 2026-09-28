# Secretary onboarding and bounded module continuation — 2026-09-28

## Exact state

- Branch: `codex/qualification-repair-247c8881`
- Application: `35637fc50d9698e4e93a0b749f722096b3ba2044`
- Preview: `dpl_DXCUsD7RMF8Sg8WUd2y2mEtux9e3`, `https://villageclaq-cjjh0z3ip-gatekipas.vercel.app`
- Isolated backend: `nisipxbuvndobyxqqglf`
- Migration history: `20260928043000_xlsx_import_and_proxy_claim_email`
- Public deployment: unchanged at rollback reference `dpl_8j2JAMtsjvCwEUZ9n3hBPZeS8RzS`

Production project `llbnliixczcqfftxpsmb` was not changed. R-012 remains archived and quarantined. The isolated backend was not reset.

## Implemented outcome

The member page accepts native `.xlsx` and `.csv`, provides both templates, and gives EN/FR instructions. XLSX input is bounded to 5 MB compressed, 25 MB expanded, 512 ZIP entries and 1,000 member rows. Formula cells, VBA/macro content, ambiguous numeric phones and non-text ambiguous values are rejected rather than evaluated or guessed. Text phone values preserve `+` and leading zeroes. Stable file-digest plus source-row keys make re-import idempotent while a changed material row conflicts.

Manual and imported members default to the regular member role. The member page no longer offers the unsupported admin role on this create path; administrative role changes remain on the separately authorized role-management path. Import creates no invitation or notification automatically.

An officer can create a copyable activation link and deliberately select email, SMS and/or WhatsApp. No external channel is preselected, and a channel is unavailable when its required recorded contact is absent. Email now uses the same authoritative `enqueue_outbound_notification` contract as the established SMS/WhatsApp path. The route does not call a provider directly.

## Hosted behavioral evidence

`scripts/qualify-secretary-onboarding-hosted.mjs` ran against the isolated project through the authenticated officer RPC and current server route. The first run created the fictional `QA XLSX Secretary 2026-09-28` membership before a local status-marker assertion stopped the script. After starting the server with the explicit expected project ref, the complete repeat produced:

```json
{
  "project": "nisipxbuvndobyxqqglf",
  "import": {
    "first_outcome": "skipped_existing",
    "repeated_outcome": "skipped_existing",
    "changed_payload": "conflict",
    "role": "member",
    "lifecycle": "active",
    "account": "not_activated"
  },
  "invitation": {
    "channel": "email",
    "queue_rows": 1,
    "provider_message_ids": 0,
    "final_status": "dead_letter_founder_suppression"
  },
  "audit_rows": 1
}
```

The protected import-receipt table correctly denied direct `service_role` SELECT. No grant was widened. The authorized retry result and material-payload conflict prove the receipt contract without bypassing that boundary. Queue readback used the existing trusted service path; group audit readback used the authorized officer session.

The founder test status endpoint returned 200 with matching isolated binding, verified service credential, delivery suppression and scheduler suppression. Server logs recorded successful 200 responses for `/api/proxy-claim/send`. Both fictional founder passwords were restored from the ignored access record after testing; the local server and temporary fixtures were removed.

Supabase's migration-history readback lists exact identity `20260928043000` with name `xlsx_import_and_proxy_claim_email` after the preserved sequence through `20260928031805`.

## Browser and navigation evidence

The current Preview loaded the English member route at the route-authoritative group URL, showed the fictional-data banner and member list, and exposed `Bulk Import`, `Bulk Invite`, `Add offline member` and `Invite Member`. Opening `Bulk Import` displayed both CSV and Excel template actions and the explicit text-phone instruction.

The browser file chooser opened, but the connected Chrome control pipe failed while transferring the local XLSX fixture and the control surface then became unavailable. The same transfer method was not retried unchanged. Therefore the final XLSX chooser-to-visible-row browser step and the changed dialog's EN/FR mobile pass remain a verification blocker owned by the browser-control environment, not a demonstrated application defect. Parser/template tests, a successful optimized build, a READY Preview, the mounted current member page and the authoritative hosted persistence/queue behavior cover the other layers.

One later bounded recovery attempt was made on 2026-09-28. Rebinding the existing authenticated Chrome QA tab failed before page interaction with `Timed out after 10000ms waiting for CDP command Emulation.setFocusEmulationEnabled`. No equivalent Chrome or alternative-browser retry was made after that control-layer failure. The checklist disposition is unchanged: actual XLSX selection through an immediate and refreshed persisted row, plus the changed EN/FR mobile and dashboard-return path, are not passed by parser or database evidence.

All unchanged module CRUD/navigation outcomes reuse the frozen FA-01–FA-08 evidence. This batch changed only member onboarding and the proxy-claim email channel. No evidence justified reopening financial, meeting, governance, growth or existing activation-security closures. Attachment CRUD remains blocked by the existing Supabase Storage-owner dependency.

## Gates

- Focused tests: **28/28 PASS**.
- Hosted onboarding script: **PASS** after the expected-backend marker was supplied.
- TypeScript: **PASS** at the application commit.
- Optimized local build: **PASS** at the application commit.
- Vercel Preview build: **READY**.
- Browser member route/import dialog: **PASS**.
- Browser XLSX file transfer and changed EN/FR mobile completion: **BLOCKED** by the unavailable browser-control connection.
- Storage API matrix: **BLOCKED** by the existing managed Storage policy/ACL owner action.

The earlier actual GPT-6 Sol verdict is preserved only for its reviewed scope. The exhausted review sequence was not restarted and no independent verdict is claimed for this later onboarding code.

## Disposition

The frozen secretary list is **11/14 PASS**. SEC-01, SEC-13 and SEC-14 are dependency-specific BLOCKED: browser file transfer/mobile completion, then the already documented Storage release gate. There is no other runnable PENDING case and no new material product failure. Public promotion did not occur.
