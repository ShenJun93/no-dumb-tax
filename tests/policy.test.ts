import { describe, expect, it } from "vitest";
import { decide, DEFAULT_POLICY, type Payment } from "@/lib/policy";

const now = new Date("2026-10-08T12:00:00Z");
const paid = (hoursAgo: number, status = "COMPLETED", id = "TX1"): Payment => ({
  id,
  status,
  amount: "9.99",
  currency: "USD",
  time: new Date(now.getTime() - hoursAgo * 3600_000).toISOString(),
});
const facts = (payments: Payment[], status = "ACTIVE", hadTrial = true) => ({ status, hadTrial, payments });

describe("decide", () => {
  it("auto refunds and cancels a fresh first charge after a trial", () => {
    const d = decide({ facts: facts([paid(10)]), intent: "forgot_to_cancel", priorRefunds: 0, now });
    expect(d).toMatchObject({ cancel: true, mode: "auto", refund: { paymentId: "TX1", amount: "9.99", currency: "USD" } });
  });

  it("uses the 48-hour boundary", () => {
    expect(decide({ facts: facts([paid(47)]), intent: "forgot_to_cancel", priorRefunds: 0, now }).mode).toBe("auto");
    const late = decide({ facts: facts([paid(49)]), intent: "forgot_to_cancel", priorRefunds: 0, now });
    expect(late.mode).toBe("merchant");
    expect(late.refund).toMatchObject({ amount: "9.99" });
    expect(late.reasons.join(" ")).toMatch(/48 hours/);
  });

  it("sends a second refund to the merchant", () => {
    expect(decide({ facts: facts([paid(5)]), intent: "forgot_to_cancel", priorRefunds: 1, now }).mode).toBe("merchant");
  });

  it("sends a later (not first) charge to the merchant", () => {
    const d = decide({ facts: facts([paid(5, "COMPLETED", "TX2"), paid(800, "COMPLETED", "TX1")]), intent: "forgot_to_cancel", priorRefunds: 0, now });
    expect(d.mode).toBe("merchant");
    expect(d.refund?.paymentId).toBe("TX2");
  });

  it("never refunds a payment that is already refunded", () => {
    const d = decide({ facts: facts([paid(5, "REFUNDED")]), intent: "forgot_to_cancel", priorRefunds: 0, now });
    expect(d.refund).toBeNull();
    expect(d).toMatchObject({ cancel: true, mode: "auto" });
  });

  it("cancels without refund when nothing was charged yet", () => {
    expect(decide({ facts: facts([]), intent: "forgot_to_cancel", priorRefunds: 0, now })).toMatchObject({ cancel: true, refund: null, mode: "auto" });
  });

  it("cancelled subscription still gets the refund decision", () => {
    expect(decide({ facts: facts([paid(3)], "CANCELLED"), intent: "forgot_to_cancel", priorRefunds: 0, now })).toMatchObject({
      cancel: false,
      mode: "auto",
      refund: { paymentId: "TX1" },
    });
  });

  it("cancel_only never refunds", () => {
    expect(decide({ facts: facts([paid(3)]), intent: "cancel_only", priorRefunds: 0, now })).toMatchObject({ cancel: true, refund: null, mode: "auto" });
  });

  it("abuse and other go to the merchant with no action", () => {
    for (const intent of ["abuse", "other"] as const) {
      expect(decide({ facts: facts([paid(3)]), intent, priorRefunds: 0, now })).toMatchObject({ cancel: false, refund: null, mode: "merchant" });
    }
  });

  it("sends a charge that differs from the plan price to the merchant", () => {
    const wrongAmount = { ...facts([{ ...paid(3), amount: "19.99" }]), price: { value: "9.99", currency: "USD" } };
    const d = decide({ facts: wrongAmount, intent: "forgot_to_cancel", priorRefunds: 0, now });
    expect(d.mode).toBe("merchant");
    expect(d.reasons.join(" ")).toMatch(/19\.99.*9\.99/);
    const rightAmount = { ...facts([paid(3)]), price: { value: "9.99", currency: "USD" } };
    expect(decide({ facts: rightAmount, intent: "forgot_to_cancel", priorRefunds: 0, now }).mode).toBe("auto");
  });

  it("no trial means no automatic refund", () => {
    expect(decide({ facts: facts([paid(3)], "ACTIVE", false), intent: "forgot_to_cancel", priorRefunds: 0, now }).mode).toBe("merchant");
  });

  it("exposes the default policy", () => {
    expect(DEFAULT_POLICY).toEqual({ autoRefundWindowHours: 48, maxAutoRefunds: 1, onlyFirstCharge: true });
  });
});
