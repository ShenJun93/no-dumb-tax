import { describe, expect, it } from "vitest";
import { APP_NAME } from "@/lib/config";

describe("smoke", () => {
  it("names the app", () => {
    expect(APP_NAME).toBe("No Dumb Tax");
  });
});
