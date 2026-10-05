import { describe, expect, it } from "vitest";
import { isReminderDue, reminderText, runDueReminders, templateReminder } from "@/lib/reminders";
import { MemoryStore } from "@/lib/store";
import type { SubscriptionFacts } from "@/lib/subscriptions";
import { FakeLlm } from "./fakes";

const base: SubscriptionFacts = {
  id: "I-1", status: "ACTIVE", planId: "P-1", planName: "Pro", price: { value: "9.99", currency: "USD" },
  hadTrial: true, trialDays: 1, inTrial: true, startTime: "2026-10-05T23:05:58Z", nextBillingTime: "2026-10-07T10:00:00Z", payments: [],
};
const at = (iso: string) => new Date(iso);

describe("isReminderDue", () => {
  it("is due inside the window before the first charge", () => {
    expect(isReminderDue(base, at("2026-10-06T23:00:00Z"), 12)).toBe(true);
    expect(isReminderDue(base, at("2026-10-06T21:00:00Z"), 12)).toBe(false);
    expect(isReminderDue(base, at("2026-10-07T10:30:00Z"), 12)).toBe(false);
  });
  it("is never due after the trial or when cancelled", () => {
    expect(isReminderDue({ ...base, inTrial: false }, at("2026-10-06T23:00:00Z"), 12)).toBe(false);
    expect(isReminderDue({ ...base, status: "CANCELLED" }, at("2026-10-06T23:00:00Z"), 12)).toBe(false);
  });
});

describe("reminder text", () => {
  it("states the date and amount in the template", () => {
    expect(templateReminder(base)).toBe(
      "Heads-up: your free trial of Pro ends soon. On 7 Oct 2026, 10:00 UTC you will be charged $9.99. Not using it? Cancel in one click below and you will pay nothing.",
    );
  });
  it("rejects a translation that changes the numbers", async () => {
    const r = await reminderText(base, "vi", new FakeLlm(["Ngày 8/10 bạn sẽ bị trừ $19.99."]));
    expect(r).toEqual({ text: templateReminder(base), source: "template" });
  });
});

describe("runDueReminders", () => {
  it("sends once per conversion and stores it", async () => {
    const store = new MemoryStore();
    await store.sadd("subs", "I-1");
    await store.set("sub:I-1", { language: "en" });
    const deps = { subs: { getFacts: async () => base }, store, llm: new FakeLlm(() => templateReminder(base)), now: () => at("2026-10-06T23:00:00Z"), windowHours: 12 };
    expect(await runDueReminders(deps)).toHaveLength(1);
    expect(await runDueReminders(deps)).toHaveLength(0);
    expect(await store.get("reminder:I-1")).toMatchObject({ subscriptionId: "I-1", chargeAt: "2026-10-07T10:00:00Z" });
  });

  it("skips a subscription whose facts cannot be read", async () => {
    const store = new MemoryStore();
    await store.sadd("subs", "I-2");
    const deps = { subs: { getFacts: async () => { throw new Error("404"); } }, store, llm: new FakeLlm([]), now: () => at("2026-10-06T23:00:00Z"), windowHours: 12 };
    expect(await runDueReminders(deps)).toEqual([]);
  });
});
