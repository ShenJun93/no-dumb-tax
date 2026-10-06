import { describe, expect, it } from "vitest";
import { registerSubscription } from "@/lib/portal";
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
