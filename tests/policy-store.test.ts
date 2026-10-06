import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "@/lib/policy";
import { getPolicy, PolicyError, savePolicy } from "@/lib/policy-store";
import { MemoryStore } from "@/lib/store";

describe("policy store", () => {
  it("defaults to the built-in policy", async () => {
    expect(await getPolicy(new MemoryStore())).toEqual(DEFAULT_POLICY);
  });

  it("saves a valid policy and logs it", async () => {
    const store = new MemoryStore();
    const p = { autoRefundWindowHours: 72, maxAutoRefunds: 2, onlyFirstCharge: false };
    expect(await savePolicy(store, p)).toEqual(p);
    expect(await getPolicy(store)).toEqual(p);
    expect((await store.lrange<{ action: string; actor: string }>("audit", 0, -1))[0]).toMatchObject({ action: "policy", actor: "merchant" });
  });

  it("rejects invalid values and keeps the old policy", async () => {
    const store = new MemoryStore();
    for (const bad of [
      { autoRefundWindowHours: 0, maxAutoRefunds: 1, onlyFirstCharge: true },
      { autoRefundWindowHours: 10000, maxAutoRefunds: 1, onlyFirstCharge: true },
      { autoRefundWindowHours: 48, maxAutoRefunds: -1, onlyFirstCharge: true },
      { autoRefundWindowHours: 48.5, maxAutoRefunds: 1, onlyFirstCharge: true },
      { autoRefundWindowHours: 48, maxAutoRefunds: 1, onlyFirstCharge: "yes" },
      null,
    ]) {
      await expect(savePolicy(store, bad)).rejects.toBeInstanceOf(PolicyError);
    }
    expect(await getPolicy(store)).toEqual(DEFAULT_POLICY);
  });
});
