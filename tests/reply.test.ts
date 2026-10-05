import { describe, expect, it } from "vitest";
import { factSheet, formatDate, formatMoney, numbersIn, onlyKnownNumbers } from "@/lib/facts";
import { draftReply, templateReply } from "@/lib/reply";
import type { SubscriptionFacts } from "@/lib/subscriptions";
import type { Decision } from "@/lib/policy";
import { FakeLlm } from "./fakes";

const facts: SubscriptionFacts = {
  id: "I-1",
  status: "ACTIVE",
  planId: "P-1",
  planName: "Pro",
  price: { value: "9.99", currency: "USD" },
  hadTrial: true,
  trialDays: 1,
  inTrial: false,
  startTime: "2026-10-05T23:05:58Z",
  nextBillingTime: "2026-11-07T10:00:00Z",
  payments: [{ id: "TX1", status: "COMPLETED", amount: "9.99", currency: "USD", time: "2026-10-07T10:05:00Z" }],
};
const decision: Decision = { cancel: true, refund: { paymentId: "TX1", amount: "9.99", currency: "USD" }, mode: "auto", reasons: [] };

describe("facts", () => {
  it("formats money and dates", () => {
    expect(formatMoney("9.99", "USD")).toBe("$9.99");
    expect(formatMoney("9.99", "EUR")).toBe("9.99 EUR");
    expect(formatDate("2026-10-07T10:05:00Z")).toBe("7 Oct 2026, 10:05 UTC");
  });

  it("lists the numbers in a text", () => {
    expect(numbersIn("Charged $9.99 on 7 Oct 2026, 10:05")).toEqual(["9.99", "7", "2026", "10", "05"]);
  });

  it("accepts text whose numbers all come from the facts", () => {
    const known = factSheet(facts);
    expect(onlyKnownNumbers("We refunded $9.99 charged on 7 Oct 2026.", known)).toBe(true);
    expect(onlyKnownNumbers("We refunded $19.99 charged on 8 Oct.", known)).toBe(false);
  });
});

describe("replies", () => {
  it("has a clear template for a completed refund", () => {
    const t = templateReply(facts, decision, "done");
    expect(t).toContain("$9.99");
    expect(t).toMatch(/refund/i);
    expect(t).toMatch(/cancel/i);
  });

  it("uses the model's text when it only repeats known numbers", async () => {
    const llm = new FakeLlm(["Wir haben Ihnen $9.99 erstattet und das Abo gekündigt."]);
    expect(await draftReply({ facts, decision, outcome: "done", language: "de", llm })).toEqual({
      text: "Wir haben Ihnen $9.99 erstattet und das Abo gekündigt.",
      source: "model",
    });
  });

  it("discards model text that adds numbers", async () => {
    const llm = new FakeLlm(["We refunded $19.99 charged on 8 Oct."]);
    const r = await draftReply({ facts, decision, outcome: "done", language: "en", llm });
    expect(r.source).toBe("template");
    expect(r.text).toBe(templateReply(facts, decision, "done"));
  });

  it("uses the template when the model fails", async () => {
    const r = await draftReply({ facts, decision, outcome: "queued", language: "en", llm: new FakeLlm(new Error("down")) });
    expect(r).toEqual({ text: templateReply(facts, decision, "queued"), source: "template" });
  });
});
