import { describe, expect, it } from "vitest";
import { PayPalClient, PayPalError } from "@/lib/paypal";
import { fakeFetch, json, tokenRoute } from "./fakes";

const cfg = { clientId: "id", clientSecret: "secret", baseUrl: "https://pp.test" };

describe("PayPalClient", () => {
  it("gets a token once and reuses it", async () => {
    const { fn, calls } = fakeFetch({ ...tokenRoute, "GET https://pp.test/v1/x": () => json(200, { ok: 1 }) });
    const pp = new PayPalClient(cfg, fn);
    await pp.request("GET", "/v1/x");
    await pp.request("GET", "/v1/x");
    expect(calls.filter((c) => c.url.endsWith("/oauth2/token"))).toHaveLength(1);
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("returns an empty object for 204", async () => {
    const { fn } = fakeFetch({ ...tokenRoute, "POST https://pp.test/v1/c": () => new Response(null, { status: 204 }) });
    expect(await new PayPalClient(cfg, fn).request("POST", "/v1/c", {})).toEqual({});
  });

  it("throws PayPalError with the issue code", async () => {
    const { fn } = fakeFetch({
      ...tokenRoute,
      "POST https://pp.test/v1/c": () => json(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "SUBSCRIPTION_STATUS_INVALID" }] }),
    });
    const err = await new PayPalClient(cfg, fn).request("POST", "/v1/c", {}).catch((e) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect(err.status).toBe(422);
    expect(err.issue).toBe("SUBSCRIPTION_STATUS_INVALID");
  });

  it("fails clearly when authentication fails", async () => {
    const { fn } = fakeFetch({ "POST https://pp.test/v1/oauth2/token": () => json(401, { error: "invalid_client" }) });
    await expect(new PayPalClient(cfg, fn).request("GET", "/v1/x")).rejects.toThrow("PayPal authentication failed");
  });
});
