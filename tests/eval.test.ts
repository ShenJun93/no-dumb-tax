import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatReport, LABELS, LANGS, parseDataset, publishProblem, scoreResults, type EvalResult } from "@/lib/eval";

const dataset = parseDataset(readFileSync(path.join(__dirname, "..", "eval", "intent-messages.jsonl"), "utf8"));

const r = (label: string, predicted: string, lang = "en", source: EvalResult["source"] = "model"): EvalResult =>
  ({ id: `${lang}-${label}-${predicted}`, lang, label, predicted, source, text: "t" }) as EvalResult;

describe("dataset", () => {
  it("has 5 messages per language and label, 120 in total, unique ids", () => {
    expect(dataset).toHaveLength(120);
    for (const lang of LANGS) for (const label of LABELS) expect(dataset.filter((m) => m.lang === lang && m.label === label), `${lang}/${label}`).toHaveLength(5);
    expect(new Set(dataset.map((m) => m.id)).size).toBe(120);
  });

  it("every row has a known label and language", () => {
    expect(() => parseDataset('{"id":"x","lang":"en","label":"forgot","text":"hi"}')).toThrow(/label/);
    expect(() => parseDataset('{"id":"x","lang":"pt","label":"other","text":"hi"}')).toThrow(/lang/);
    expect(() => parseDataset('{"id":"x","lang":"en","label":"other","text":""}')).toThrow(/text/);
  });
});

describe("hard set", () => {
  const hard = parseDataset(readFileSync(path.join(__dirname, "..", "eval", "intent-hard.jsonl"), "utf8"));
  it("has 10 messages per label, 40 in total, unique ids", () => {
    expect(hard).toHaveLength(40);
    for (const label of LABELS) expect(hard.filter((m) => m.label === label), label).toHaveLength(10);
    expect(new Set(hard.map((m) => m.id)).size).toBe(40);
  });
});

describe("held-out set", () => {
  const heldout = parseDataset(readFileSync(path.join(__dirname, "..", "eval", "intent-heldout.jsonl"), "utf8"));
  it("has 10 messages per label, 40 in total, unique ids, none shared with the hard set", () => {
    const hard = parseDataset(readFileSync(path.join(__dirname, "..", "eval", "intent-hard.jsonl"), "utf8"));
    expect(heldout).toHaveLength(40);
    for (const label of LABELS) expect(heldout.filter((m) => m.label === label), label).toHaveLength(10);
    expect(new Set(heldout.map((m) => m.id)).size).toBe(40);
    const hardTexts = new Set(hard.map((m) => m.text));
    expect(heldout.filter((m) => hardTexts.has(m.text))).toEqual([]);
  });
});

describe("scoring", () => {
  it("scores per label and per language", () => {
    const s = scoreResults([r("abuse", "abuse"), r("abuse", "other"), r("other", "other", "vi"), r("cancel_only", "cancel_only", "vi")]);
    expect(s).toMatchObject({ total: 4, correct: 3, accuracy: 0.75 });
    expect(s.byLabel.abuse).toEqual({ total: 2, correct: 1, accuracy: 0.5 });
    expect(s.byLang.vi).toEqual({ total: 2, correct: 2, accuracy: 1 });
    expect(s.confusion.abuse.other).toBe(1);
  });

  it("counts safety misses, including an unrequested refund for a cancel-only message", () => {
    const s = scoreResults([r("abuse", "forgot_to_cancel"), r("other", "forgot_to_cancel"), r("cancel_only", "forgot_to_cancel"), r("forgot_to_cancel", "forgot_to_cancel")]);
    expect(s.safetyMisses).toBe(3);
  });

  it("refuses to publish a run without a model key or with fallbacks", () => {
    const clean = scoreResults([r("abuse", "abuse")]);
    const degraded = scoreResults([r("other", "other", "en", "fallback")]);
    expect(publishProblem(clean, { hasKey: true, force: false })).toBeNull();
    expect(publishProblem(clean, { hasKey: false, force: false })).toMatch(/NEBIUS_API_KEY/);
    expect(publishProblem(degraded, { hasKey: true, force: false })).toMatch(/fell back/);
    expect(publishProblem(degraded, { hasKey: true, force: true })).toBeNull();
  });

  it("counts fallbacks and where abuse was caught", () => {
    const s = scoreResults([r("abuse", "abuse", "en", "rule"), r("abuse", "abuse", "es", "model"), r("abuse", "other", "it", "fallback"), r("other", "other", "en", "fallback")]);
    expect(s.fallbacks).toBe(2);
    expect(s.abuseBySource).toEqual({ rule: 1, model: 1, fallback: 1 });
  });

  it("writes a report with the tables and every miss", () => {
    const rows = [r("abuse", "abuse"), r("abuse", "forgot_to_cancel", "es")];
    const md = formatReport(scoreResults(rows), rows, { model: "Qwen/Q", date: "2026-10-06" });
    expect(md).toContain("Qwen/Q");
    expect(md).toContain("synthetic");
    expect(md).toContain("| abuse | 2 | 1 | 50.0% |");
    expect(md).toContain("Safety misses: 1");
    expect(md).toContain("es-abuse-forgot_to_cancel");
  });

  it("uses a custom title and limits when given (hard set)", () => {
    const rows = [r("abuse", "abuse")];
    const md = formatReport(scoreResults(rows), rows, { model: "m", date: "d", title: "Hard set", limits: ["Only 40 messages."] });
    expect(md.startsWith("# Hard set")).toBe(true);
    expect(md).toContain("- Only 40 messages.");
    expect(md).not.toMatch(/20 scenarios/);
  });

  it("states the limits of a synthetic set", () => {
    const rows = [r("abuse", "abuse")];
    const md = formatReport(scoreResults(rows), rows, { model: "m", date: "d" });
    expect(md).toContain("## Limits");
    expect(md).toMatch(/optimistic/);
    expect(md).toMatch(/20 scenarios/);
    expect(md).toMatch(/same author/);
  });
});
