import { describe, expect, it } from "vitest";
import { askAssistant, BLOCKED_TOOLS, type ChatCreate, type LocalTool, type ToolkitLike } from "@/lib/assistant";

const fn = (name: string) => ({ type: "function" as const, function: { name, description: name, parameters: { type: "object", properties: {} } } });
const call = (id: string, name: string, args = "{}") => ({ id, type: "function" as const, function: { name, arguments: args } });

function toolkit(): ToolkitLike & { handled: string[] } {
  const handled: string[] = [];
  return {
    handled,
    getTools: () => [fn("show_subscription_details"), fn("create_refund"), fn("cancel_subscription")],
    handleToolCall: async (c) => {
      handled.push(c.function.name);
      return { content: JSON.stringify({ status: "ACTIVE" }) };
    },
  };
}
const local: LocalTool[] = [
  { name: "refund_policy", description: "policy", parameters: { type: "object", properties: {} }, run: async () => ({ autoRefundWindowHours: 48 }) },
];

function scripted(steps: Array<{ content?: string; calls?: ReturnType<typeof call>[] }>) {
  const seen: Parameters<ChatCreate>[0][] = [];
  const create: ChatCreate = async (body) => {
    seen.push(structuredClone(body));
    const s = steps.shift() ?? { content: "done" };
    return { choices: [{ message: { content: s.content ?? null, tool_calls: s.calls } }] };
  };
  return { create, seen };
}

describe("askAssistant", () => {
  it("offers only read-only tools", async () => {
    const { create, seen } = scripted([{ content: "hi" }]);
    await askAssistant({ create, model: "m", toolkit: toolkit(), local }, "hello");
    const names = seen[0].tools.map((t) => t.function.name);
    expect(names).toEqual(["show_subscription_details", "refund_policy"]);
    for (const b of BLOCKED_TOOLS) expect(names).not.toContain(b);
  });

  it("runs PayPal and local tools, then answers", async () => {
    const tk = toolkit();
    const { create, seen } = scripted([
      { calls: [call("c1", "show_subscription_details", '{"subscription_id":"I-1"}'), call("c2", "refund_policy")] },
      { content: "I-1 is active; auto refunds within 48 hours." },
    ]);
    const r = await askAssistant({ create, model: "m", toolkit: tk, local }, "status of I-1?");
    expect(r).toEqual({ answer: "I-1 is active; auto refunds within 48 hours.", toolCalls: ["show_subscription_details", "refund_policy"] });
    expect(tk.handled).toEqual(["show_subscription_details"]);
    const toolMsgs = seen[1].messages.filter((m) => m.role === "tool");
    expect(toolMsgs.map((m) => m.content)).toEqual(['{"status":"ACTIVE"}', '{"autoRefundWindowHours":48}']);
  });

  it("refuses tools that are not offered", async () => {
    const tk = toolkit();
    const { create, seen } = scripted([{ calls: [call("c1", "create_refund", '{"capture_id":"TX1"}')] }, { content: "I cannot do that." }]);
    const r = await askAssistant({ create, model: "m", toolkit: tk, local }, "refund TX1");
    expect(tk.handled).toEqual([]);
    expect(String(seen[1].messages.at(-1)!.content)).toMatch(/not available/);
    expect(r.answer).toBe("I cannot do that.");
  });

  it("stops after the step limit", async () => {
    const loop = Array.from({ length: 10 }, (_, i) => ({ calls: [call(`c${i}`, "refund_policy")] }));
    const { create } = scripted(loop);
    const r = await askAssistant({ create, model: "m", toolkit: toolkit(), local, maxSteps: 3 }, "loop");
    expect(r.answer).toMatch(/step limit/);
    expect(r.toolCalls).toHaveLength(3);
  });

  it("returns tool errors to the model instead of failing", async () => {
    const tk = toolkit();
    tk.handleToolCall = async () => {
      throw new Error("PayPal 500");
    };
    const { create, seen } = scripted([{ calls: [call("c1", "show_subscription_details")] }, { content: "PayPal is unavailable." }]);
    await askAssistant({ create, model: "m", toolkit: tk, local }, "status?");
    expect(String(seen[1].messages.at(-1)!.content)).toContain("PayPal 500");
  });
});
