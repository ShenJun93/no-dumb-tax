import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/store";

describe("MemoryStore", () => {
  it("stores JSON values by key", async () => {
    const s = new MemoryStore();
    await s.set("a", { x: 1 });
    expect(await s.get("a")).toEqual({ x: 1 });
    expect(await s.get("missing")).toBeNull();
  });

  it("setnx only sets once", async () => {
    const s = new MemoryStore();
    expect(await s.setnx("k", 1)).toBe(true);
    expect(await s.setnx("k", 2)).toBe(false);
    expect(await s.get("k")).toBe(1);
  });

  it("counts with incr", async () => {
    const s = new MemoryStore();
    expect(await s.incr("c")).toBe(1);
    expect(await s.incr("c")).toBe(2);
  });

  it("keeps sets and lists", async () => {
    const s = new MemoryStore();
    await s.sadd("set", "a");
    await s.sadd("set", "a");
    await s.sadd("set", "b");
    expect((await s.smembers("set")).sort()).toEqual(["a", "b"]);
    await s.lpush("l", "first");
    await s.lpush("l", "second");
    expect(await s.lrange("l", 0, -1)).toEqual(["second", "first"]);
    await s.lrem("l", "first");
    expect(await s.lrange("l", 0, -1)).toEqual(["second"]);
  });

  it("expires values", async () => {
    const s = new MemoryStore(() => 1000);
    await s.set("t", 1, 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s as any).now = () => 2500;
    expect(await s.get("t")).toBeNull();
  });
});
