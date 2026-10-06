import OpenAI from "openai";
import type { Store } from "./store";

export interface Llm {
  complete(system: string, user: string, opts?: { json?: boolean; maxTokens?: number }): Promise<string>;
}

export class LlmUnavailable extends Error {}

/**
 * One daily budget for every model call (classifier, reminders, assistant, Studio AI).
 * Console calls (assistant, Studio AI) may use at most half of it, so customer requests always have budget left.
 */
export async function takeLlmBudget(store: Store, cap: number, now: Date = new Date(), scope: "customer" | "console" = "customer"): Promise<boolean> {
  const day = now.toISOString().slice(0, 10);
  if (scope === "console" && (await store.incr(`llm:console:${day}`, 2 * 86400)) > Math.floor(cap / 2)) return false;
  const used = await store.incr(`llm:${day}`, 2 * 86400);
  return used <= cap;
}

export class NebiusLlm implements Llm {
  private client: OpenAI;

  constructor(
    private cfg: { apiKey: string; model: string; dailyCap: number },
    private store: Store,
  ) {
    this.client = new OpenAI({ apiKey: cfg.apiKey, baseURL: "https://api.tokenfactory.nebius.com/v1/", timeout: 30_000, maxRetries: 1 });
  }

  async complete(system: string, user: string, opts: { json?: boolean; maxTokens?: number } = {}) {
    if (!this.cfg.apiKey) throw new LlmUnavailable("No model key configured");
    if (!(await takeLlmBudget(this.store, this.cfg.dailyCap))) throw new LlmUnavailable("Daily model budget reached");
    try {
      const res = await this.client.chat.completions.create({
        model: this.cfg.model,
        temperature: 0,
        max_tokens: opts.maxTokens ?? 400,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
      });
      return res.choices[0]?.message?.content ?? "";
    } catch (e) {
      throw new LlmUnavailable(`Model call failed: ${(e as Error).message}`);
    }
  }
}
