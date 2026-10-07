/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PayPalClient } from "./paypal";
import type { Store } from "./store";

export async function verifyWebhook(pp: PayPalClient, webhookId: string, headers: Headers, rawBody: string): Promise<boolean> {
  const h = (k: string) => headers.get(k) ?? "";
  if (!webhookId || !h("paypal-transmission-id") || !h("paypal-transmission-sig")) return false;
  try {
    const r = await pp.request<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
      auth_algo: h("paypal-auth-algo"),
      cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: JSON.parse(rawBody),
    });
    return r.verification_status === "SUCCESS";
  } catch {
    return false;
  }
}

export interface WebhookSummary {
  id: string;
  type: string;
  subscriptionId: string | null;
  time: string;
}

function subscriptionIdOf(event: any): string | null {
  if (String(event.event_type).startsWith("BILLING.SUBSCRIPTION.")) return event.resource?.id ?? null;
  return event.resource?.billing_agreement_id ?? null;
}

export async function applyWebhookEvent(store: Store, event: any): Promise<"applied" | "duplicate"> {
  if (!(await store.setnx(`webhook:${event.id}`, 1, 7 * 86400))) return "duplicate";
  const summary: WebhookSummary = {
    id: event.id,
    type: event.event_type,
    // A v2 capture refund event names only the refund; we stored which subscription it belongs to.
    subscriptionId:
      subscriptionIdOf(event) ??
      (event.event_type === "PAYMENT.CAPTURE.REFUNDED" ? await store.get<string>(`refundsub:${event.resource?.id}`) : null),
    time: event.create_time,
  };
  await store.lpush("events", summary);
  if (summary.subscriptionId) await store.sadd("subs", summary.subscriptionId);
  if (summary.type === "CUSTOMER.DISPUTE.CREATED") await store.incr("disputes");
  return "applied";
}
