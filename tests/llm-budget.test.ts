import { describe, expect, it } from "vitest";
import { takeLlmBudget } from "@/lib/llm";
import { MemoryStore } from "@/lib/store";

describe("takeLlmBudget", () => {
  it("allows calls up to the daily cap", async () => {
    const store = new MemoryStore();
    const day = new Date("2026-10-07T12:00:00Z");
    expect(await takeLlmBudget(store, 2, day)).toBe(true);
    expect(await takeLlmBudget(store, 2, day)).toBe(true);
    expect(await takeLlmBudget(store, 2, day)).toBe(false);
    expect(await takeLlmBudget(store, 2, new Date("2026-10-08T00:00:00Z"))).toBe(true);
  });
});
