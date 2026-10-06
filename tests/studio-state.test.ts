import { describe, expect, it } from "vitest";
import { buildInitialState, SOURCE_FIELDS, studioData, widgetFieldIds } from "@/lib/console/studio-state";

describe("studio state", () => {
  it("references only declared sources and fields", () => {
    const declared = new Set(Object.entries(SOURCE_FIELDS).flatMap(([src, fields]) => fields.map((f) => `${src}.${f.id}`)));
    const used = widgetFieldIds(buildInitialState());
    expect(used.length).toBeGreaterThan(10);
    for (const id of used) expect(declared, id).toContain(id);
  });

  it("lays out every widget inside 24 columns without overlap", () => {
    for (const page of buildInitialState().pages) {
      const ids = Object.keys(page.widgets);
      expect(Object.keys(page.widgetLayout).sort()).toEqual(ids.sort());
      const cells = new Set<string>();
      for (const l of Object.values(page.widgetLayout)) {
        expect(l.xTrack + l.xSpan).toBeLessThanOrEqual(24);
        for (let x = l.xTrack; x < l.xTrack + l.xSpan; x++)
          for (let y = l.yTrack; y < l.yTrack + l.ySpan; y++) {
            expect(cells.has(`${x},${y}`), `${page.id} overlap at ${x},${y}`).toBe(false);
            cells.add(`${x},${y}`);
          }
      }
    }
  });

  it("gives every field a format (AG Studio refuses fields without one)", () => {
    for (const [src, fields] of Object.entries(SOURCE_FIELDS)) for (const f of fields) expect(f.format, `${src}.${f.id}`).toBeTruthy();
  });

  it("turns a dashboard into the four sources", () => {
    const data = studioData({ subscriptions: [], requests: [], audit: [], kpis: [] });
    expect(data.sources.map((s) => s.id)).toEqual(["subscriptions", "requests", "audit", "kpis"]);
    expect(data.sources.every((s) => Array.isArray(s.fields) && s.fields.length > 0)).toBe(true);
  });
});
