import type { Intent } from "./policy";

export const LABELS: Intent[] = ["forgot_to_cancel", "cancel_only", "other", "abuse"];
export const LANGS = ["en", "vi", "de", "fr", "es", "it"];

export interface EvalMessage { id: string; lang: string; label: Intent; text: string }
export interface EvalResult extends EvalMessage { predicted: Intent; source: "model" | "rule" | "fallback" }
type Tally = { total: number; correct: number; accuracy: number };
export interface Score {
  total: number; correct: number; accuracy: number;
  byLabel: Record<string, Tally>;
  byLang: Record<string, Tally>;
  confusion: Record<string, Record<string, number>>;
  safetyMisses: number; fallbacks: number;
  abuseBySource: { rule: number; model: number; fallback: number };
}

export function parseDataset(jsonl: string): EvalMessage[] {
  return jsonl
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line, i) => {
      const m = JSON.parse(line) as EvalMessage;
      if (!LABELS.includes(m.label)) throw new Error(`line ${i + 1}: unknown label ${m.label}`);
      if (!LANGS.includes(m.lang)) throw new Error(`line ${i + 1}: unknown lang ${m.lang}`);
      if (!m.text?.trim()) throw new Error(`line ${i + 1}: empty text`);
      if (!m.id) throw new Error(`line ${i + 1}: missing id`);
      return m;
    });
}

function tally(rows: EvalResult[]): Tally {
  const correct = rows.filter((r) => r.predicted === r.label).length;
  return { total: rows.length, correct, accuracy: rows.length ? correct / rows.length : 0 };
}

export function scoreResults(rows: EvalResult[]): Score {
  const group = (key: "label" | "lang") => {
    const out: Record<string, Tally> = {};
    for (const k of new Set(rows.map((r) => r[key]))) out[k] = tally(rows.filter((r) => r[key] === k));
    return out;
  };
  const confusion: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    confusion[r.label] ??= {};
    confusion[r.label][r.predicted] = (confusion[r.label][r.predicted] ?? 0) + 1;
  }
  const abuse = rows.filter((r) => r.label === "abuse");
  return {
    ...tally(rows),
    byLabel: group("label"),
    byLang: group("lang"),
    confusion,
    // Any non-refund message read as forgot_to_cancel could move money the customer did not ask for.
    safetyMisses: rows.filter((r) => r.label !== "forgot_to_cancel" && r.predicted === "forgot_to_cancel").length,
    fallbacks: rows.filter((r) => r.source === "fallback").length,
    abuseBySource: {
      rule: abuse.filter((r) => r.source === "rule").length,
      model: abuse.filter((r) => r.source === "model").length,
      fallback: abuse.filter((r) => r.source === "fallback").length,
    },
  };
}

/** Why a run must not overwrite the published results, or null when it may. */
export function publishProblem(score: Score, opts: { hasKey: boolean; force: boolean }): string | null {
  if (!opts.hasKey) return "NEBIUS_API_KEY is empty: every message would fall back. Nothing was written.";
  if (score.fallbacks > 0 && !opts.force) return `${score.fallbacks} messages fell back (model unavailable). Not overwriting the published results; rerun, or pass --force.`;
  return null;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function formatReport(score: Score, rows: EvalResult[], meta: { model: string; date: string }): string {
  const table = (title: string, groups: Record<string, Tally>, order: string[]) =>
    [`| ${title} | Messages | Correct | Accuracy |`, "|---|---|---|---|", ...order.filter((k) => groups[k]).map((k) => `| ${k} | ${groups[k].total} | ${groups[k].correct} | ${pct(groups[k].accuracy)} |`)].join("\n");
  const confusion = [
    `| Label \\ predicted | ${LABELS.join(" | ")} |`,
    `|---|${LABELS.map(() => "---").join("|")}|`,
    ...LABELS.filter((l) => score.confusion[l]).map((l) => `| ${l} | ${LABELS.map((p) => score.confusion[l][p] ?? 0).join(" | ")} |`),
  ].join("\n");
  const misses = rows.filter((r) => r.predicted !== r.label);
  return [
    "# Intent classification evaluation",
    "",
    `Model: \`${meta.model}\` · run on ${meta.date} · ${score.total} messages · overall accuracy **${pct(score.accuracy)}**.`,
    "",
    "The messages are synthetic: Claude wrote them for this evaluation (see `eval/intent-messages.jsonl`). They are not real customer messages.",
    "",
    `Safety misses: ${score.safetyMisses} (messages labelled cancel_only, other or abuse that were classified as forgot_to_cancel, the only class that can lead to an automatic refund; the refund rules still cap any refund at one charge).`,
    `Model fallbacks: ${score.fallbacks}. Abuse caught by the rule pre-check: ${score.abuseBySource.rule}, by the model: ${score.abuseBySource.model}.`,
    "",
    "## By class",
    "",
    table("Class", score.byLabel, LABELS),
    "",
    "## By language",
    "",
    table("Language", score.byLang, LANGS),
    "",
    "## Confusion matrix",
    "",
    confusion,
    "",
    `## Every miss (${misses.length})`,
    "",
    "| Id | Label | Predicted | Source | Message |",
    "|---|---|---|---|---|",
    ...misses.map((m) => `| ${m.id} | ${m.label} | ${m.predicted} | ${m.source} | ${m.text.replace(/\|/g, "\\|")} |`),
    "",
    "## Limits",
    "",
    "- Each message has one clear intent, and Claude wrote them, so this score is an optimistic estimate. Real customers mix intents (\"cancel, and also the app is slow\"), write very short or sarcastic messages, and switch languages.",
    "- Each class is 5 scenarios written in 6 languages (same amounts, dates and plan name), so this measures 20 scenarios across languages, not 120 independent cases. One miss moves a class-language cell by 20 points.",
    "- The same author wrote the classifier prompt and these messages: the abuse messages follow the prompt's own definition, and no \"other\" message mentions a charge or a refund (a double charge, an annual-plan refund, compensation for an outage). The boundary that matters most for money is barely tested, so 0 safety misses is weak evidence.",
    "- The classifier only proposes. Whether money moves is decided by the refund rules, which cap any refund at the last charge, so a misclassification cannot refund more than one charge.",
    "",
  ].join("\n");
}
