/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { PayPalClient } from "@/lib/paypal";
import { MemoryStore } from "@/lib/store";
import { SubscriptionService } from "@/lib/subscriptions";
import { fakeFetch, json, tokenRoute } from "./fakes";

const cfg = { clientId: "id", clientSecret: "s", baseUrl: "https://pp.test" };
const plan = {
  id: "P-1",
  name: "Pro",
  billing_cycles: [
    { tenure_type: "TRIAL", sequence: 1, total_cycles: 1, frequency: { interval_unit: "DAY", interval_count: 1 } },
    { tenure_type: "REGULAR", sequence: 2, total_cycles: 0, pricing_scheme: { fixed_price: { value: "9.99", currency_code: "USD" } } },
  ],
};
const sub = {
  id: "I-1",
  status: "ACTIVE",
  plan_id: "P-1",
  start_time: "2026-10-05T23:05:58Z",
  billing_info: { next_billing_time: "2026-10-07T10:00:00Z" },
};

function service(routes: Record<string, any> = {}) {
  const f = fakeFetch({
    ...tokenRoute,
    "GET https://pp.test/v1/billing/subscriptions/I-1/transactions": () => json(200, { transactions: [] }),
    "GET https://pp.test/v1/billing/subscriptions/I-1": () => json(200, sub),
    "GET https://pp.test/v1/billing/plans/P-1": () => json(200, plan),
    ...routes,
  });
  return { svc: new SubscriptionService(new PayPalClient(cfg, f.fn), new MemoryStore()), calls: f.calls };
}

describe("SubscriptionService", () => {
  it("reads facts for a subscription in its trial", async () => {
    const { svc } = service();
    const f = await svc.getFacts("I-1", new Date("2026-10-06T08:00:00Z"));
    expect(f).toMatchObject({
      id: "I-1",
      status: "ACTIVE",
      planName: "Pro",
      price: { value: "9.99", currency: "USD" },
      hadTrial: true,
      trialDays: 1,
      inTrial: true,
      nextBillingTime: "2026-10-07T10:00:00Z",
      payments: [],
    });
  });

  it("maps transactions to payments and leaves the trial after a charge", async () => {
    const { svc } = service({
      "GET https://pp.test/v1/billing/subscriptions/I-1/transactions": () =>
        json(200, {
          transactions: [
            { id: "TX1", status: "COMPLETED", time: "2026-10-07T10:05:00Z", amount_with_breakdown: { gross_amount: { value: "9.99", currency_code: "USD" } } },
          ],
        }),
    });
    const f = await svc.getFacts("I-1", new Date("2026-10-07T12:00:00Z"));
    expect(f.payments).toEqual([{ id: "TX1", status: "COMPLETED", amount: "9.99", currency: "USD", time: "2026-10-07T10:05:00Z" }]);
    expect(f.inTrial).toBe(false);
  });

  it("caches the plan", async () => {
    const { svc, calls } = service();
    await svc.getFacts("I-1");
    await svc.getFacts("I-1");
    expect(calls.filter((c) => c.url.endsWith("/billing/plans/P-1"))).toHaveLength(1);
  });

  it("creates a product once and a trial plan", async () => {
    const { svc, calls } = service({
      "POST https://pp.test/v1/catalogs/products": () => json(201, { id: "PROD-1" }),
      "POST https://pp.test/v1/billing/plans": () => json(201, { id: "P-9", status: "ACTIVE" }),
    });
    expect(await svc.createTrialPlan({ name: "Pro", price: "9.99", trialDays: 1 })).toEqual({ productId: "PROD-1", planId: "P-9" });
    await svc.createTrialPlan({ name: "Pro", price: "9.99", trialDays: 1 });
    expect(calls.filter((c) => c.url.endsWith("/catalogs/products"))).toHaveLength(1);
    const planBody = JSON.parse(String(calls.find((c) => c.url.endsWith("/billing/plans"))!.init.body));
    expect(planBody.billing_cycles[0]).toMatchObject({ tenure_type: "TRIAL", frequency: { interval_unit: "DAY", interval_count: 1 } });
    expect(planBody.billing_cycles[1].pricing_scheme.fixed_price).toEqual({ value: "9.99", currency_code: "USD" });
  });

  it("cancel of an already cancelled subscription is treated as done", async () => {
    const { svc } = service({
      "POST https://pp.test/v1/billing/subscriptions/I-1/cancel": () =>
        json(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "SUBSCRIPTION_STATUS_INVALID" }] }),
    });
    expect(await svc.cancel("I-1", "test")).toBe("already");
  });

  it("refunds with an idempotency key and the exact amount", async () => {
    const { svc, calls } = service({
      "POST https://pp.test/v2/payments/captures/TX1/refund": () => json(201, { id: "R-1", status: "COMPLETED" }),
    });
    expect(await svc.refund("TX1", "9.99", "USD", "req-42")).toEqual({ id: "R-1", status: "COMPLETED" });
    const call = calls.find((c) => c.url.endsWith("/refund"))!;
    expect((call.init.headers as Record<string, string>)["PayPal-Request-Id"]).toBe("refund-req-42");
    expect(JSON.parse(String(call.init.body))).toMatchObject({ amount: { value: "9.99", currency_code: "USD" } });
  });
});
