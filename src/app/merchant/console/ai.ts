/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { AgStudioAiModule, createAiHarness, directLlmRunner } from "ag-studio";
import { openaiAdapter } from "@/vendor/ag-studio/openaiAdapter";

const INSTRUCTIONS = `You are the merchant's assistant inside the No Dumb Tax console (PayPal sandbox).
You can explore the data sources (subscriptions, requests, audit, kpis), run queries and add widgets to the current page.
For questions about PayPal itself (subscription details, refunds, disputes) or the refund policy, call ask_paypal.
You cannot approve, refund or cancel anything: the merchant does that with the Approve button.`;

export function studioAi(token: string): { modules: unknown[]; ai: unknown } {
  const adapter = openaiAdapter({ endpoint: "/api/merchant/studio-ai", key: token, model: "server-chosen" });
  const ai = ({ api }: any) => {
    const askPayPal = api.defineAiTool({
      name: "ask_paypal",
      description: "Ask the read-only PayPal assistant about subscriptions, refunds, disputes, pending approvals or the refund policy.",
      params: (s: any) => s.object({ question: s.string({ description: "The question in plain words." }) }),
      execute: async (args: { question: string }, ctx: any) => {
        const r = await fetch("/api/merchant/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-merchant-token": token },
          body: JSON.stringify({ question: args.question }),
          signal: ctx.signal,
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return ctx.error(j.error ?? "The PayPal assistant is unavailable.");
        return ctx.success(j.answer, { answer: j.answer, toolCalls: j.toolCalls });
      },
    });
    return createAiHarness(api, ({ tools: { studio } }: any) => ({
      agents: [
        directLlmRunner({
          id: "merchant",
          adapter,
          instructions: () => INSTRUCTIONS,
          tools: () => [studio.viewSchema(), studio.viewPage(), studio.executeQuery(), studio.addWidget(), askPayPal],
        }),
      ],
      primary: "merchant",
    }));
  };
  return { modules: [AgStudioAiModule], ai };
}
