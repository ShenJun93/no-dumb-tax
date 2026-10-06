import { describe, expect, it } from "vitest";
import { MemoryStore, RedisStore, storeFromEnv } from "@/lib/store";

describe("storeFromEnv", () => {
  it("uses Upstash with either variable naming", () => {
    expect(storeFromEnv({ UPSTASH_REDIS_REST_URL: "https://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" })).toBeInstanceOf(RedisStore);
    expect(storeFromEnv({ KV_REST_API_URL: "https://x.upstash.io", KV_REST_API_TOKEN: "t" })).toBeInstanceOf(RedisStore);
  });

  it("uses memory locally", () => {
    expect(storeFromEnv({})).toBeInstanceOf(MemoryStore);
  });

  it("refuses to run on Vercel without Redis", () => {
    expect(() => storeFromEnv({ VERCEL: "1" })).toThrow(/Redis/);
  });
});
