# End-to-end run on the PayPal sandbox

Hosted build: https://no-dumb-tax.vercel.app (Vercel, production). All ids are PayPal sandbox ids.

## Setup (2026-10-06)

| Step | Result |
|---|---|
| Demo plan created through `POST /api/merchant/plans` | product `PROD-6LM62393PP6824835`, plan `P-1NF78424HF750441BNLCD2TY` (1-day free trial, then $9.99/month) |
| Webhook registered (`scripts/register-webhook.mjs`) | webhook `24B923922M990503T` |
| Reminder window on the demo deployment | `REMINDER_WINDOW_HOURS=12` |

## Run 1

| Time (UTC) | Step | Evidence |
|---|---|---|
| 2026-10-06 00:23 | Sandbox Personal buyer subscribed with the PayPal button on the demo page and landed on the customer portal | subscription `I-J54HSNHP8PK1`, status ACTIVE; portal shows "Free trial — first charge on 7 Oct 2026, 10:00 UTC", no charges |
| 2026-10-06 00:23 | Webhook received and its signature verified by PayPal | event `WH-2KC22093VD846993B-0PB92871AB482902Y`, `BILLING.SUBSCRIPTION.ACTIVATED`; merchant overview counts 1 subscription |
| from 2026-10-06 22:00 | Reminder due (12 h before the charge) | _pending_ |
| 2026-10-07 10:00 | Conversion charge | _pending_ |
| after the charge | "I forgot to cancel my trial, please refund me" → automatic refund + cancel | _pending_ |
| after the charge | Injection message → `abuse`, queued, nothing executed | _pending_ |
