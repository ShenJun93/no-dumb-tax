// Runs the real classifier over a labelled message set with an in-memory store (no Upstash, no PayPal).
//   npm run eval:intent                 main set (run 1)  → eval/intent-results.json, docs/eval.md
//   npm run eval:intent -- --set hard   hard set (run 2)  → eval/intent-hard-results.json, docs/eval-hard.md
// `--report-only` rewrites the report from the saved results without calling the model again.
import { readFileSync, writeFileSync } from "node:fs";
import { formatReport, parseDataset, publishProblem, scoreResults, type EvalResult } from "../src/lib/eval";
import { classify } from "../src/lib/intent";
import { NebiusLlm } from "../src/lib/llm";
import { MemoryStore } from "../src/lib/store";

const HELDOUT_LIMITS = [
  "Claude wrote these 40 messages after run 2 and after deciding the fix, and committed them before changing any code. They were never used to tune the classifier, but the same author wrote them knowing the weak spots, so they are held out, not independent.",
  "Labels follow the same definitions as run 2: billing errors and annual-plan refunds are \"other\"; asking for more than one charge or telling the model what to answer is \"abuse\".",
  "40 messages is a small sample, and the languages are uneven (more English and Vietnamese).",
  "The classifier only proposes. Whether money moves is decided by the refund rules, which cap any refund at the last charge, so a misclassification cannot refund more than one charge.",
];

const SETS = {
  main: { data: "eval/intent-messages.jsonl", results: "eval/intent-results.json", report: "docs/eval.md", title: undefined, limits: undefined },
  hard: {
    data: "eval/intent-hard.jsonl",
    results: "eval/intent-hard-results.json",
    report: "docs/eval-hard.md",
    title: "Intent classification evaluation: hard set (run 2)",
    limits: [
      "Claude wrote these 40 messages after seeing run 1, to probe its weak spots: money questions that are not a forgotten trial (double charges, annual-plan refunds, outage compensation), mixed intents, very short or sarcastic messages, code-switching, and subtler injection attempts. They are still synthetic and by the same author as the classifier prompt.",
      "Labels follow the prompt's definitions: a double charge or an annual-plan refund is \"other\" because the automatic rules only cover the first charge after a free trial; \"I forgot to cancel, and refund every month\" is \"abuse\" because it asks for more than one charge.",
      "40 messages is a small sample, and the languages are uneven (more English and Vietnamese).",
      "The classifier only proposes. Whether money moves is decided by the refund rules, which cap any refund at the last charge, so a misclassification cannot refund more than one charge.",
    ],
  },
  "heldout-before": {
    data: "eval/intent-heldout.jsonl",
    results: "eval/intent-heldout-before-results.json",
    report: "docs/eval-heldout-before.md",
    title: "Intent classification evaluation: held-out set, before the fix (run 3a)",
    limits: HELDOUT_LIMITS,
  },
  "heldout-after": {
    data: "eval/intent-heldout.jsonl",
    results: "eval/intent-heldout-after-results.json",
    report: "docs/eval-heldout-after.md",
    title: "Intent classification evaluation: held-out set, after the fix (run 3b)",
    limits: HELDOUT_LIMITS,
  },
  "main-after": {
    data: "eval/intent-messages.jsonl",
    results: "eval/intent-main-after-results.json",
    report: "docs/eval-main-after.md",
    title: "Intent classification evaluation: main set, after the fix (run 1b, regression check)",
    limits: undefined,
  },
  "hard-after": {
    data: "eval/intent-hard.jsonl",
    results: "eval/intent-hard-after-results.json",
    report: "docs/eval-hard-after.md",
    title: "Intent classification evaluation: hard set, after the fix (run 2b)",
    limits: [
      "The fix was written after seeing run 2's misses on this very set, so this score is expected to rise and says little on its own; the held-out set (run 3) is the fairer test.",
      "Same messages and labels as run 2; still synthetic and by the same author as the classifier prompt; 40 messages, uneven languages.",
      "The classifier only proposes. Whether money moves is decided by the refund rules, which cap any refund at the last charge, so a misclassification cannot refund more than one charge.",
    ],
  },
} as const;

const setName = (process.argv[process.argv.indexOf("--set") + 1] ?? "main") as keyof typeof SETS;
const set = process.argv.includes("--set") ? SETS[setName] : SETS.main;
if (!set) {
  console.error(`Unknown set. Use one of: ${Object.keys(SETS).join(", ")}`);
  process.exit(1);
}
const meta = (model: string, date: string) => ({ model, date, title: set.title, source: set.data, limits: set.limits ? [...set.limits] : undefined });

if (process.argv.includes("--report-only")) {
  const saved = JSON.parse(readFileSync(set.results, "utf8")) as { model: string; date: string; rows: EvalResult[] };
  writeFileSync(set.report, formatReport(scoreResults(saved.rows), saved.rows, meta(saved.model, saved.date.slice(0, 10))));
  console.log("report rewritten from the saved run of", saved.date);
} else {
  const model = process.env.NEBIUS_MODEL ?? "Qwen/Qwen3-30B-A3B-Instruct-2507";
  if (!process.env.NEBIUS_API_KEY) {
    console.error("NEBIUS_API_KEY is empty: nothing was run or written.");
    process.exit(1);
  }
  const llm = new NebiusLlm({ apiKey: process.env.NEBIUS_API_KEY, model, dailyCap: Number(process.env.EVAL_CAP ?? 300) }, new MemoryStore());
  const messages = parseDataset(readFileSync(set.data, "utf8"));

  const rows: EvalResult[] = [];
  for (const m of messages) {
    const c = await classify(m.text, llm);
    rows.push({ ...m, predicted: c.intent, source: c.source });
    process.stdout.write(c.intent === m.label ? "." : "x");
  }
  const score = scoreResults(rows);
  const problem = publishProblem(score, { hasKey: true, force: process.argv.includes("--force") });
  if (problem) {
    console.error(`\n${problem}`);
    process.exit(1);
  }
  const date = new Date().toISOString();
  writeFileSync(set.results, JSON.stringify({ model, date, score, rows }, null, 2) + "\n");
  writeFileSync(set.report, formatReport(score, rows, meta(model, date.slice(0, 10))));
  console.log(`\naccuracy ${(score.accuracy * 100).toFixed(1)}%, safety misses ${score.safetyMisses}, fallbacks ${score.fallbacks}`);
}
