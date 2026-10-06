import { describe, expect, it } from "vitest";
import { approvalWidgets } from "@/app/merchant/console/widgets";

describe("approvalWidgets", () => {
  it("keeps Studio's default widget menu and adds the approval queue", () => {
    const defaults = { widgets: [], menu: [{ label: "Charts", widgetIds: ["value", "grid"] }], defaultType: "grid" };
    const config = approvalWidgets("t")(defaults);
    const ids = config.menu.flatMap((g: { widgetIds: string[] }) => g.widgetIds);
    expect(ids).toEqual(expect.arrayContaining(["value", "grid", "approvalQueue"]));
  });
});
