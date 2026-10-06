import { describe, expect, it } from "vitest";
import { buildDashboard } from "@/lib/dashboard";
import type { CustomerRequest } from "@/lib/requests";
import { MemoryStore } from "@/lib/store";
import type { SubscriptionFacts } from "@/lib/subscriptions";

const now = new Date("2026-10-07T00:00:00Z");
const trial: SubscriptionFacts = {
  id: "I-1", status: "ACTIVE", planId: "P-1", planName: "Notely Pro", price: { value: "9.99", currency: "USD" },
  hadTrial: true, trialDays: 1, inTrial: true, startTime: "2026-10-06T00:21:18Z", nextBillingTime: "2026-10-07T10:00:00Z", payments: [],
};
const request = (id: string, status: CustomerRequest["status"], mode: "auto" | "merchant", refund: boolean): CustomerRequest => ({
  id, subscriptionId: "I-1", message: "I forgot", intent: "forgot_to_cancel", language: "en", status, reply: "", createdAt: "2026-10-07T00:00:00Z",
  decision: { cancel: true, mode, reasons: ["r1", "r2"], refund: refund ? { paymentId: "TX1", amount: "9.99", currency: "USD" } : null },
});

async function setup() {
  const store = new MemoryStore();
  await store.sadd("subs", "I-1");
  await store.sadd("subs", "I-2");
  await store.set("reminder:I-1", { subscriptionId: "I-1", text: "t", source: "template", sentAt: "x", chargeAt: "2026-10-07T10:00:00Z" });
  for (const r of [request("R1", "done", "auto", true), request("R2", "pending", "merchant", true)]) {
    await store.set(`req:${r.id}`, r);
    await store.lpush("requests", r.id);
  }
  await store.lpush("audit", { at: "2026-10-07T00:00:00Z", requestId: "R1", subscriptionId: "I-1", action: "refund", actor: "auto", detail: "d" });
  await store.incr("disputes");
  const subs = {
    getFactsCached: async (id: string) => {
      if (id === "I-2") throw new Error("PayPal 404");
      return trial;
    },
  };
  return { store, subs };
}

describe("buildDashboard", () => {
  it("builds rows and KPIs", async () => {
    const d = await buildDashboard({ ...(await setup()), now });
    expect(d.subscriptions.find((s) => s.id === "I-1")).toEqual({
      id: "I-1", plan: "Notely Pro", status: "ACTIVE", inTrial: true, nextCharge: "2026-10-07T10:00:00Z",
      hoursToCharge: 10, price: 9.99, charged: 0, refunded: 9.99, reminderSent: true,
    });
    expect(d.requests.map((r) => [r.id, r.status, r.refundAmount, r.reasons])).toEqual([
      ["R2", "pending", 9.99, "r1 r2"],
      ["R1", "done", 9.99, "r1 r2"],
    ]);
    expect(d.audit).toHaveLength(1);
    expect(d.kpis).toEqual([
      { activeTrials: 1, chargesNext24h: 1, amountNext24h: 9.99, remindersSent: 1, resolvedAutomatically: 1, refundedTotal: 9.99, pendingApprovals: 1, disputes: 1 },
    ]);
  });

  it("keeps loading when one subscription cannot be read", async () => {
    const d = await buildDashboard({ ...(await setup()), now });
    expect(d.subscriptions.find((s) => s.id === "I-2")).toMatchObject({ status: "UNKNOWN", inTrial: false, nextCharge: null });
  });
});
