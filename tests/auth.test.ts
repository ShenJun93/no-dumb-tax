import { describe, expect, it } from "vitest";
import { isCron, isMerchant, portalTokenOk } from "@/lib/auth";

const req = (headers: Record<string, string>) => new Request("http://x/api", { headers });

describe("auth", () => {
  it("checks the merchant token", () => {
    expect(isMerchant(req({ "x-merchant-token": "m1" }), "m1")).toBe(true);
    expect(isMerchant(req({ "x-merchant-token": "m2" }), "m1")).toBe(false);
    expect(isMerchant(req({}), "")).toBe(false);
  });
  it("checks the portal token", () => {
    expect(portalTokenOk("abc", "abc")).toBe(true);
    expect(portalTokenOk("abc", "abd")).toBe(false);
    expect(portalTokenOk(undefined, "abc")).toBe(false);
    expect(portalTokenOk("abc", null)).toBe(false);
  });
  it("checks the cron secret", () => {
    expect(isCron(req({ authorization: "Bearer s1" }), "s1")).toBe(true);
    expect(isCron(req({ authorization: "Bearer s2" }), "s1")).toBe(false);
    expect(isCron(req({}), "")).toBe(false);
  });
});
