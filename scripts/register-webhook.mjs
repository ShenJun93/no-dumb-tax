// Registers the sandbox webhook: node --env-file=.env.local scripts/register-webhook.mjs <baseUrl>
const [base] = process.argv.slice(2);
const pp = process.env.PAYPAL_BASE_URL ?? "https://api-m.sandbox.paypal.com";
const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
const tok = await fetch(`${pp}/v1/oauth2/token`, {
  method: "POST",
  headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
  body: "grant_type=client_credentials",
}).then((r) => r.json());
const types = [
  "BILLING.SUBSCRIPTION.ACTIVATED", "BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.SUSPENDED", "BILLING.SUBSCRIPTION.PAYMENT.FAILED", "PAYMENT.SALE.COMPLETED",
  "PAYMENT.SALE.REFUNDED", "CUSTOMER.DISPUTE.CREATED", "CUSTOMER.DISPUTE.RESOLVED",
];
const r = await fetch(`${pp}/v1/notifications/webhooks`, {
  method: "POST",
  headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ url: `${base}/api/webhooks/paypal`, event_types: types.map((name) => ({ name })) }),
});
const body = await r.json();
console.log(r.status, body.id ?? JSON.stringify(body));
