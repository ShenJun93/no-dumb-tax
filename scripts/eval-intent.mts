// Runs the real classifier over eval/intent-messages.jsonl with an in-memory store (no Upstash, no PayPal).
// `--report-only` rewrites docs/eval.md from eval/intent-results.json without calling the model again.
import { readFileSync, writeFileSync } from "node:fs";
import { formatReport, parseDataset, publishProblem, scoreResults, type EvalResult } from "../src/lib/eval";
import { classify } from "../src/lib/intent";
import { NebiusLlm } from "../src/lib/llm";
import { MemoryStore } from "../src/lib/store";

if (process.argv.includes("--report-only")) {
  const saved = JSON.parse(readFileSync("eval/intent-results.json", "utf8")) as { model: string; date: string; rows: EvalResult[] };
  writeFileSync("docs/eval.md", formatReport(scoreResults(saved.rows), saved.rows, { model: saved.model, date: saved.date.slice(0, 10) }));
  console.log("report rewritten from the saved run of", saved.date);
} else {
  const model = process.env.NEBIUS_MODEL ?? "Qwen/Qwen3-30B-A3B-Instruct-2507";
  if (!process.env.NEBIUS_API_KEY) {
    console.error("NEBIUS_API_KEY is empty: nothing was run or written.");
    process.exit(1);
  }
  const llm = new NebiusLlm({ apiKey: process.env.NEBIUS_API_KEY ?? "", model, dailyCap: Number(process.env.EVAL_CAP ?? 300) }, new MemoryStore());
  const messages = parseDataset(readFileSync("eval/intent-messages.jsonl", "utf8"));

  const rows: EvalResult[] = [];
  for (const m of messages) {
    const c = await classify(m.text, llm);
    rows.push({ ...m, predicted: c.intent, source: c.source });
    process.stdout.write(c.intent === m.label ? "." : "x");
  }
  const score = scoreResults(rows);
  const problem = publishProblem(score, { hasKey: Boolean(process.env.NEBIUS_API_KEY), force: process.argv.includes("--force") });
  if (problem) {
    console.error(`\n${problem}`);
    process.exit(1);
  }
  writeFileSync("eval/intent-results.json", JSON.stringify({ model, date: new Date().toISOString(), score, rows }, null, 2) + "\n");
  writeFileSync("docs/eval.md", formatReport(score, rows, { model, date: new Date().toISOString().slice(0, 10) }));
  console.log(`\naccuracy ${(score.accuracy * 100).toFixed(1)}%, safety misses ${score.safetyMisses}, fallbacks ${score.fallbacks}`);
}
