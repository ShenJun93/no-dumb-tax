import OpenAI from "openai";
import type { Store } from "./store";

export interface Llm {
  complete(system: string, user: string, opts?: { json?: boolean; maxTokens?: number }): Promise<string>;
}

export class LlmUnavailable extends Error {}

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
    const day = new Date().toISOString().slice(0, 10);
    const used = await this.store.incr(`llm:${day}`, 2 * 86400);
    if (used > this.cfg.dailyCap) throw new LlmUnavailable("Daily model budget reached");
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
