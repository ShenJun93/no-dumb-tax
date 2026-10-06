/* eslint-disable @typescript-eslint/no-explicit-any */
export const STUDIO_MAX_OUTPUT_TOKENS = 2000;

// Fields of a Responses request we pass on. Everything else (model, stream, keys, reasoning effort) is decided here.
const PASS_THROUGH = ["input", "instructions", "tools", "tool_choice", "text", "temperature", "top_p"];

export function prepareStudioRequest(body: unknown, model: string): Record<string, unknown> {
  const src = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { model, stream: false };
  const asked = Number(src.max_output_tokens);
  out.max_output_tokens = Number.isFinite(asked) && asked > 0 ? Math.min(asked, STUDIO_MAX_OUTPUT_TOKENS) : STUDIO_MAX_OUTPUT_TOKENS;
  for (const k of PASS_THROUGH) if (k in src) out[k] = src[k];
  if (Array.isArray(out.input)) out.input = out.input.map(withId);
  return out;
}

// Nebius (unlike OpenAI) rejects earlier assistant messages and function calls in `input` that have no id.
function withId(item: any, index: number): any {
  if (!item || typeof item !== "object" || item.id) return item;
  if (item.type === "message" && item.role === "assistant") return { ...item, id: `msg_${index}` };
  if (item.type === "function_call") return { ...item, id: `fc_${index}` };
  return item;
}

/**
 * Nebius cannot stream tool calls, so we call it without streaming and replay the finished response
 * as the Responses stream events AG Studio's adapter reads.
 */
export function responseToSse(response: Record<string, any>): string {
  const events: Record<string, unknown>[] = [{ type: "response.created", response: { ...response, status: "in_progress", output: [] } }];
  (response.output ?? []).forEach((raw: Record<string, any>, output_index: number) => {
    const item: Record<string, any> = { ...raw, id: raw.id ?? `item_${output_index}` };
    if (item.type === "message") {
      events.push({ type: "response.output_item.added", output_index, item: { ...item, content: [] } });
      const text = (item.content ?? []).filter((c: any) => c.type === "output_text").map((c: any) => c.text).join("");
      if (text) events.push({ type: "response.output_text.delta", item_id: item.id, output_index, content_index: 0, delta: text });
    } else if (item.type === "function_call") {
      events.push({ type: "response.output_item.added", output_index, item: { ...item, arguments: "" } });
      events.push({ type: "response.function_call_arguments.delta", item_id: item.id, output_index, delta: item.arguments ?? "" });
    } else if (item.type === "reasoning") {
      events.push({ type: "response.output_item.added", output_index, item });
    } else {
      return;
    }
    events.push({ type: "response.output_item.done", output_index, item });
  });
  const end = response.status === "incomplete" ? "response.incomplete" : response.status === "failed" ? "response.failed" : "response.completed";
  events.push({ type: end, response });
  return events.map((e, i) => `data: ${JSON.stringify({ ...e, sequence_number: i })}\n\n`).join("");
}
