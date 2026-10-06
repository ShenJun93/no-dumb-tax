import type { ChatCompletionMessageParam, ChatCompletionMessageToolCall, ChatCompletionTool } from "openai/resources/chat/completions";

/** Agent Toolkit actions the assistant may use: reads only. */
export const PAYPAL_READ_ONLY_ACTIONS = {
  subscriptions: { show: true },
  disputes: { list: true, get: true },
  payments: { getRefunds: true },
};

/** Never offered to a model, even if a toolkit configuration change exposes them. */
export const BLOCKED_TOOLS = [
  "create_refund", "cancel_subscription", "update_subscription", "create_subscription", "accept_dispute_claim",
  "create_invoice", "send_invoice", "cancel_sent_invoice", "create_order", "create_product", "update_product",
];

export interface ToolkitLike {
  getTools(): ChatCompletionTool[];
  handleToolCall(call: ChatCompletionMessageToolCall): Promise<{ content: unknown }>;
}

export interface LocalTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run(args: Record<string, unknown>): Promise<unknown>;
}

export type ChatCreate = (body: {
  model: string;
  messages: ChatCompletionMessageParam[];
  tools: ChatCompletionTool[];
  temperature: number;
  max_tokens: number;
}) => Promise<{ choices: { message: { content: string | null; tool_calls?: ChatCompletionMessageToolCall[] } }[] }>;

const SYSTEM = `You help a small subscription merchant understand their PayPal sandbox account and their No Dumb Tax console.
You can only read data. You cannot refund, cancel, approve or change anything: refunds are decided by the merchant's rules and the Approve button.
Use the tools for every fact. Never guess ids, dates or amounts. Answer in two to five short sentences, in the merchant's language.`;

async function runTool(d: { toolkit: ToolkitLike; local: LocalTool[] }, allowed: Set<string>, call: ChatCompletionMessageToolCall): Promise<string> {
  const name = call.function.name;
  if (!allowed.has(name)) return JSON.stringify({ error: `Tool ${name} is not available to this assistant. It can only read data.` });
  try {
    const local = d.local.find((t) => t.name === name);
    if (local) return JSON.stringify(await local.run(JSON.parse(call.function.arguments || "{}"))).slice(0, 8000);
    return String((await d.toolkit.handleToolCall(call)).content).slice(0, 8000);
  } catch (e) {
    return JSON.stringify({ error: (e as Error).message });
  }
}

export async function askAssistant(
  d: { create: ChatCreate; model: string; toolkit: ToolkitLike; local: LocalTool[]; maxSteps?: number },
  question: string,
): Promise<{ answer: string; toolCalls: string[] }> {
  const paypalTools = d.toolkit.getTools().filter((t) => !BLOCKED_TOOLS.includes(t.function.name));
  const tools: ChatCompletionTool[] = [
    ...paypalTools,
    ...d.local.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } })),
  ];
  const allowed = new Set(tools.map((t) => t.function.name));
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: question.slice(0, 2000) },
  ];
  const toolCalls: string[] = [];
  for (let step = 0; step < (d.maxSteps ?? 5); step++) {
    const res = await d.create({ model: d.model, messages, tools, temperature: 0, max_tokens: 600 });
    const msg = res.choices[0]?.message;
    if (!msg) break;
    if (!msg.tool_calls?.length) return { answer: msg.content ?? "", toolCalls };
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
    for (const call of msg.tool_calls) {
      toolCalls.push(call.function.name);
      messages.push({ role: "tool", tool_call_id: call.id, content: await runTool(d, allowed, call) });
    }
  }
  return { answer: "I could not finish this question within the step limit. Please ask something narrower.", toolCalls };
}
