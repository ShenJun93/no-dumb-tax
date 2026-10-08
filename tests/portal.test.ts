import { describe, expect, it } from "vitest";
import { portalView, registerSubscription } from "@/lib/portal";
import { MemoryStore } from "@/lib/store";
import type { SubscriptionFacts } from "@/lib/subscriptions";

const facts = { id: "I-ABCDEF1", planId: "P-1" } as SubscriptionFacts;

async function setup() {
  const store = new MemoryStore();
  await store.sadd("plans", "P-1");
  return { store, subs: { getFacts: async () => facts }, publicBaseUrl: "https://app.test" };
}

describe("registerSubscription", () => {
  it("returns a portal link the first time only", async () => {
    const d = await setup();
    const first = await registerSubscription(d, { subscriptionId: "I-ABCDEF1", language: "de-DE" });
    expect(first.status).toBe(200);
    expect(first.body.portalUrl).toMatch(/^https:\/\/app\.test\/portal\/I-ABCDEF1\?t=[0-9a-f-]{36}$/);
    const again = await registerSubscription(d, { subscriptionId: "I-ABCDEF1", language: "en" });
    expect(again.status).toBe(409);
    expect(JSON.stringify(again.body)).not.toContain("t=");
    expect(await d.store.get("sub:I-ABCDEF1")).toMatchObject({ language: "de" });
  });

  it("rejects bad ids and other merchants' plans", async () => {
    const d = await setup();
    expect((await registerSubscription(d, { subscriptionId: "nope" })).status).toBe(400);
    d.subs.getFacts = async () => ({ ...facts, planId: "P-OTHER" });
    expect((await registerSubscription(d, { subscriptionId: "I-ABCDEF1" })).status).toBe(403);
  });
});

describe("portalView", () => {
  const trial = {
    id: "I-ABCDEF1", status: "ACTIVE", planId: "P-1", planName: "Notely Pro", price: { value: "9.99", currency: "USD" },
    hadTrial: true, trialDays: 1, inTrial: true, startTime: "2026-10-07T16:00:00Z", nextBillingTime: "2026-10-08T10:00:00Z", payments: [],
  } as SubscriptionFacts;
  const reminder = { text: "Heads-up: your free trial ends soon." };
  const request = { createdAt: "2026-10-08T14:01:59.311Z", message: "I forgot to cancel", status: "done" as const, reply: "We refunded $9.99." };

  it("shows the reminder only while the trial runs", () => {
    expect(portalView(trial, reminder, []).reminder).toEqual(reminder);
    const charged = { ...trial, inTrial: false, payments: [{ id: "T1", status: "COMPLETED", amount: "9.99", currency: "USD", time: "2026-10-08T13:59:00Z" }] };
    expect(portalView(charged, reminder, []).reminder).toBeNull();
    expect(portalView({ ...trial, status: "CANCELLED" }, reminder, []).reminder).toBeNull();
  });

  it("formats request times like the rest of the portal", () => {
    expect(portalView(trial, null, [request]).requests).toEqual([
      { at: "8 Oct 2026, 14:01 UTC", message: "I forgot to cancel", status: "done", reply: "We refunded $9.99." },
    ]);
  });
});
