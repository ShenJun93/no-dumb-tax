import { describe, expect, it } from "vitest";
import { actionLabel, pendingItems } from "@/lib/console/approvals";

const row = (id: string, status: string, refundAmount: unknown, cancel: unknown) => ({
  id, subscriptionId: "I-1", status, refundAmount, cancel, reasons: "Older than 48 hours.", message: "I forgot",
});

describe("approval helpers", () => {
  it("keeps pending and failed requests only, with typed values", () => {
    expect(pendingItems([row("a", "done", 9.99, true), row("b", "pending", "9.99", true), row("c", "failed", 0, false), row("d", "rejected", 1, true)])).toEqual([
      { id: "b", subscriptionId: "I-1", status: "pending", refundAmount: 9.99, cancel: true, currency: "USD", cancelled: false, reasons: "Older than 48 hours.", message: "I forgot", result: "" },
      { id: "c", subscriptionId: "I-1", status: "failed", refundAmount: 0, cancel: false, currency: "USD", cancelled: false, reasons: "Older than 48 hours.", message: "I forgot", result: "" },
    ]);
  });

  it("describes what Approve will do", () => {
    expect(actionLabel({ ...pendingItems([row("b", "pending", 9.99, true)])[0] })).toBe("Approve: refund $9.99 and cancel");
    expect(actionLabel({ ...pendingItems([row("c", "pending", 0, false)])[0] })).toBe("Approve: no money moves");
    expect(actionLabel({ ...pendingItems([row("e", "pending", 5, false)])[0] })).toBe("Approve: refund $5.00");
  });
});
