import { describe, expect, it } from "vitest";
import { actionLabel, approvalMessage, pendingItems } from "@/lib/console/approvals";
import { nextConsoleData } from "@/lib/console/studio-state";
import { buildDashboard, mapLimit } from "@/lib/dashboard";
import { takeLlmBudget } from "@/lib/llm";
import { DEFAULT_POLICY } from "@/lib/policy";
import { getPolicy, resetPolicy, savePolicy } from "@/lib/policy-store";
import type { CustomerRequest } from "@/lib/requests";
import { MemoryStore } from "@/lib/store";

describe("shared demo policy", () => {
  it("lets a saved policy expire back to the defaults", async () => {
    let now = 0;
    const store = new MemoryStore(() => now);
    await savePolicy(store, { autoRefundWindowHours: 1, maxAutoRefunds: 0, onlyFirstCharge: true }, { ttlSec: 3600 });
    expect((await getPolicy(store)).autoRefundWindowHours).toBe(1);
    now = 3601_000;
    expect(await getPolicy(store)).toEqual(DEFAULT_POLICY);
  });

  it("restores the defaults on request and logs it", async () => {
    const store = new MemoryStore();
    await savePolicy(store, { autoRefundWindowHours: 2, maxAutoRefunds: 0, onlyFirstCharge: false });
    await resetPolicy(store);
    expect(await getPolicy(store)).toEqual(DEFAULT_POLICY);
    expect((await store.lrange<{ action: string }>("audit", 0, -1))[0].action).toBe("policy-reset");
  });

  it("keeps a saved non-default policy when a later save is invalid", async () => {
    const store = new MemoryStore();
    const good = { autoRefundWindowHours: 72, maxAutoRefunds: 2, onlyFirstCharge: false };
    await savePolicy(store, good);
    await expect(savePolicy(store, { autoRefundWindowHours: 0, maxAutoRefunds: 1, onlyFirstCharge: true })).rejects.toThrow();
    expect(await getPolicy(store)).toEqual(good);
  });
});

describe("console model budget", () => {
  it("refuses over budget for the console at half the cap while customers keep the rest", async () => {
    const store = new MemoryStore();
    const day = new Date("2026-10-07T12:00:00Z");
    expect(await takeLlmBudget(store, 4, day, "console")).toBe(true);
    expect(await takeLlmBudget(store, 4, day, "console")).toBe(true);
    expect(await takeLlmBudget(store, 4, day, "console")).toBe(false);
    expect(await takeLlmBudget(store, 4, day)).toBe(true);
    expect(await takeLlmBudget(store, 4, day)).toBe(true);
    expect(await takeLlmBudget(store, 4, day)).toBe(false);
  });
});

describe("approval queue", () => {
  const row = { id: "r", subscriptionId: "I-1", status: "pending", refundAmount: 9.99, cancel: true, cancelled: true, currency: "USD", reasons: "x", message: "m", result: "" };

  it("does not promise a cancel that already happened", () => {
    expect(actionLabel(pendingItems([row])[0])).toBe("Approve: refund $9.99");
    expect(actionLabel(pendingItems([{ ...row, cancelled: false }])[0])).toBe("Approve: refund $9.99 and cancel");
  });

  it("shows non-USD amounts with their currency", () => {
    expect(actionLabel(pendingItems([{ ...row, currency: "EUR", refundAmount: 5 }])[0])).toBe("Approve: refund 5.00 EUR");
  });

  it("explains what happened after a click", () => {
    expect(approvalMessage(200, { status: "done" })).toBe("Done.");
    expect(approvalMessage(200, { status: "rejected" })).toBe("Rejected.");
    expect(approvalMessage(200, { status: "failed", result: "PayPal 500" })).toBe("PayPal could not finish it: PayPal 500");
    expect(approvalMessage(409, { error: "Request is not pending" })).toBe("Request is not pending");
    expect(approvalMessage(500, null)).toBe("Something went wrong (500). Nothing new was refunded.");
  });

  it("carries the failure reason, the cancel state and the currency into the dashboard", async () => {
    const store = new MemoryStore();
    const r: CustomerRequest = {
      id: "R9", subscriptionId: "I-1", message: "m", intent: "forgot_to_cancel", language: "en", status: "failed", reply: "", createdAt: "t",
      result: "PayPal 500", cancelled: true,
      decision: { cancel: true, mode: "merchant", reasons: [], refund: { paymentId: "TX1", amount: "9.99", currency: "USD" } },
    };
    await store.set("req:R9", r);
    await store.lpush("requests", "R9");
    const d = await buildDashboard({ store, subs: { getFactsCached: async () => { throw new Error("x"); } } });
    expect(d.requests[0]).toMatchObject({ result: "PayPal 500", cancelled: true, currency: "USD" });
  });
});

describe("console refresh", () => {
  it("keeps the last good data when a refresh fails", () => {
    const good = { sources: [] };
    expect(nextConsoleData(good, undefined)).toBe(good);
    const fresh = { sources: [] };
    expect(nextConsoleData(good, fresh)).toBe(fresh);
  });
});

describe("dashboard lookups", () => {
  it("runs at most the given number of lookups at once, in order", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 5, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return n * 2;
    });
    expect(peak).toBeLessThanOrEqual(5);
    expect(peak).toBeGreaterThan(1);
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]);
  });
});
