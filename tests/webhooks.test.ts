import { describe, expect, it } from "vitest";
import { PayPalClient } from "@/lib/paypal";
import { MemoryStore } from "@/lib/store";
import { applyWebhookEvent, verifyWebhook } from "@/lib/webhooks";
import { fakeFetch, json, tokenRoute } from "./fakes";

const cfg = { clientId: "id", clientSecret: "s", baseUrl: "https://pp.test" };
const headers = new Headers({
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
  "paypal-transmission-id": "t1",
  "paypal-transmission-sig": "sig",
  "paypal-transmission-time": "2026-10-07T10:00:00Z",
});
const event = { id: "WH-1", event_type: "PAYMENT.SALE.COMPLETED", create_time: "2026-10-07T10:05:00Z", resource: { id: "TX1", billing_agreement_id: "I-1" } };

describe("verifyWebhook", () => {
  it("accepts a SUCCESS verification and sends the right fields", async () => {
    const f = fakeFetch({ ...tokenRoute, "POST https://pp.test/v1/notifications/verify-webhook-signature": () => json(200, { verification_status: "SUCCESS" }) });
    expect(await verifyWebhook(new PayPalClient(cfg, f.fn), "WH-ID", headers, JSON.stringify(event))).toBe(true);
    const body = JSON.parse(String(f.calls.at(-1)!.init.body));
    expect(body).toMatchObject({ webhook_id: "WH-ID", transmission_id: "t1", auth_algo: "SHA256withRSA", webhook_event: { id: "WH-1" } });
  });

  it("rejects a forged webhook", async () => {
    const f = fakeFetch({ ...tokenRoute, "POST https://pp.test/v1/notifications/verify-webhook-signature": () => json(200, { verification_status: "FAILURE" }) });
    expect(await verifyWebhook(new PayPalClient(cfg, f.fn), "WH-ID", headers, JSON.stringify(event))).toBe(false);
  });

  it("rejects when headers are missing or no webhook id is set", async () => {
    const f = fakeFetch({ ...tokenRoute });
    expect(await verifyWebhook(new PayPalClient(cfg, f.fn), "WH-ID", new Headers(), "{}")).toBe(false);
    expect(await verifyWebhook(new PayPalClient(cfg, f.fn), "", headers, "{}")).toBe(false);
  });
});

describe("applyWebhookEvent", () => {
  it("records an event once and links it to the subscription", async () => {
    const store = new MemoryStore();
    expect(await applyWebhookEvent(store, event)).toBe("applied");
    expect(await applyWebhookEvent(store, event)).toBe("duplicate");
    expect(await store.lrange("events", 0, -1)).toEqual([{ id: "WH-1", type: "PAYMENT.SALE.COMPLETED", subscriptionId: "I-1", time: "2026-10-07T10:05:00Z" }]);
    expect(await store.smembers("subs")).toEqual(["I-1"]);
  });

  it("links a v2 capture refund event to its subscription through the stored refund id", async () => {
    const store = new MemoryStore();
    await store.set("refundsub:R-1", "I-1");
    await applyWebhookEvent(store, { id: "WH-3", event_type: "PAYMENT.CAPTURE.REFUNDED", create_time: "t", resource: { id: "R-1" } });
    expect((await store.lrange<{ subscriptionId: string | null }>("events", 0, 0))[0].subscriptionId).toBe("I-1");
  });

  it("counts disputes", async () => {
    const store = new MemoryStore();
    await applyWebhookEvent(store, { id: "WH-2", event_type: "CUSTOMER.DISPUTE.CREATED", create_time: "t", resource: { dispute_id: "D-1" } });
    expect(await store.get("disputes")).toBe(1);
  });
});
