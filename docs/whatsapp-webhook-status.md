# WhatsApp Webhook Status Callbacks

VillageClaq stores Meta WhatsApp delivery-status callbacks so a Graph API send response with `message_status=accepted` can be followed through to final provider status.

## Endpoint

- Route path: `/api/webhooks/whatsapp`
- Production callback URL: `https://www.villageclaq.com/api/webhooks/whatsapp`
- Staging callback URL: use the active Vercel deployment URL plus `/api/webhooks/whatsapp`

The `GET` handler is for Meta verification. It returns `hub.challenge` only when `hub.mode=subscribe` and `hub.verify_token` matches `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

The `POST` handler accepts WhatsApp `messages` webhook payloads and extracts status callbacks from `entry[].changes[].value.statuses[]`.

## Required Env Vars

- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`: shared verify token entered in Meta webhook setup.
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only key used to insert status events and update matching queue rows.

Message sending still requires the existing WhatsApp env vars:

- `WHATSAPP_API_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_API_VERSION`

Do not print or paste these values into logs, docs, or support notes.

## Stored Data

Status events are inserted into `public.whatsapp_message_status_events`:

- `provider_message_id`: Meta `wamid`.
- `status`: `sent`, `delivered`, `read`, `failed`, or another Meta status if introduced later.
- `recipient_phone_mask`: masked only, never the full recipient number.
- `meta_timestamp`: timestamp from Meta when present.
- `raw_event`: sanitized JSON with phone-bearing fields masked.
- `error_code`, `error_title`, `error_message`: populated for failed events when Meta includes errors.

Matching `notifications_queue` rows are found by `data.providerMessageId`. Their `data` JSON is updated with:

- `latestProviderStatus`
- `latestProviderStatusAt`
- `providerErrorCode`
- `providerErrorMessage`

The original `data.providerStatus` value is preserved, so the initial `accepted` send response remains distinct from later delivery callbacks.

## Meta Setup

1. Deploy the migration and app code.
2. Set `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in Vercel for the target environment.
3. In Meta App Dashboard, configure the Webhooks product for the WhatsApp Business Account.
4. Use callback URL `https://www.villageclaq.com/api/webhooks/whatsapp` and the same verify token.
5. Subscribe the app/WABA to the `messages` webhook field so outbound status callbacks are delivered.
6. Confirm the WABA has at least one subscribed app. The launch investigation found `subscribed_apps` count `0`, which means status callbacks will not arrive.

Meta's Cloud API overview states that outgoing message delivery status updates are reported through webhooks, and that webhook servers should be ready for concurrent status-event delivery. See Meta's Cloud API overview: https://developers.facebook.com/docs/whatsapp/cloud-api/overview

## Verify Subscription

Use Meta App Dashboard first:

- Webhooks callback verification should complete successfully.
- WhatsApp Business Account webhooks should show the `messages` field subscribed.

Use Graph API when credentials allow it:

```bash
curl -s \
  -H "Authorization: Bearer $WHATSAPP_API_TOKEN" \
  "https://graph.facebook.com/$WHATSAPP_API_VERSION/$WHATSAPP_BUSINESS_ACCOUNT_ID/subscribed_apps"
```

Expected result: a non-empty `data` array for the correct WABA/app subscription. Do not paste tokens in terminal output, logs, or tickets.

## Inspect Final Status For A wamid

Run read-only SQL in Supabase. Replace the placeholder with the Meta provider message ID.

```sql
select
  provider_message_id,
  status,
  recipient_phone_mask,
  meta_timestamp,
  error_code,
  error_title,
  error_message,
  created_at
from public.whatsapp_message_status_events
where provider_message_id = '<wamid>'
order by created_at asc;
```

```sql
select
  id,
  status as queue_status,
  data->>'providerStatus' as initial_provider_status,
  data->>'latestProviderStatus' as latest_provider_status,
  data->>'latestProviderStatusAt' as latest_provider_status_at,
  data->>'providerErrorCode' as provider_error_code,
  data->>'providerErrorMessage' as provider_error_message
from public.notifications_queue
where data->>'providerMessageId' = '<wamid>';
```

## Safe Next One-Message Test

Do this only after the endpoint is deployed, migration is applied, Vercel has `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, and Meta shows the WABA/app subscription as active.

1. Keep custom-domain promotion on HOLD.
2. Select exactly one queue row for exactly one opted-in WhatsApp-capable recipient.
3. Trigger exactly one cron endpoint with `Authorization: Bearer <CRON_SECRET>`.
4. Confirm the cron response has one send attempt and one Meta `wamid`.
5. Wait for webhook rows for that `wamid`.
6. PASS the test only if the recipient confirms exactly one message and Supabase shows final `delivered` or `read`.
7. If Meta sends `failed`, capture the status row and fix only the exact provider/config/template/eligibility issue before any retry.

## Hardening Still Needed

This repo did not have existing Meta webhook signature validation. The current foundation implements verify-token challenge handling, safe parsing, masked persistence, and no secret logging. Before broad launch, add `X-Hub-Signature-256` validation using the Meta App Secret over the raw POST body.
