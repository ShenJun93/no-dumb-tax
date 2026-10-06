/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { prepareStudioRequest, responseToSse, STUDIO_MAX_OUTPUT_TOKENS } from "@/lib/studio-ai";

const events = (sse: string) =>
  sse
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => JSON.parse(frame.replace(/^data: /, "")));

describe("prepareStudioRequest", () => {
  it("forces the model, disables streaming and caps tokens", () => {
    const out = prepareStudioRequest(
      { model: "gpt-5", stream: true, max_output_tokens: 100000, input: [{ role: "user", content: "hi" }], tools: [], reasoning: { effort: "high" }, api_key: "x" },
      "Qwen/Q",
    );
    expect(out).toEqual({ model: "Qwen/Q", stream: false, max_output_tokens: STUDIO_MAX_OUTPUT_TOKENS, input: [{ role: "user", content: "hi" }], tools: [] });
  });

  it("keeps a smaller token limit and survives junk", () => {
    expect(prepareStudioRequest({ max_output_tokens: 300 }, "m").max_output_tokens).toBe(300);
    expect(prepareStudioRequest("junk", "m")).toEqual({ model: "m", stream: false, max_output_tokens: STUDIO_MAX_OUTPUT_TOKENS });
  });

  it("gives earlier assistant items the ids Nebius requires", () => {
    const out = prepareStudioRequest(
      {
        input: [
          { type: "message", role: "user", content: "hi" },
          { type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] },
          { type: "function_call", call_id: "c1", name: "view_schema", arguments: "{}" },
          { type: "function_call_output", call_id: "c1", output: "{}" },
          { type: "message", role: "assistant", id: "msg_keep", content: [] },
        ],
      },
      "m",
    );
    const input = out.input as any[];
    expect(input[0].id).toBeUndefined();
    expect(input[1].id).toBe("msg_1");
    expect(input[2].id).toBe("fc_2");
    expect(input[3].id).toBeUndefined();
    expect(input[4].id).toBe("msg_keep");
  });
});

describe("responseToSse", () => {
  it("replays text and function calls as Responses stream events", () => {
    const response = {
      id: "resp_1",
      status: "completed",
      output: [
        { id: "msg_1", type: "message", role: "assistant", content: [{ type: "output_text", text: "Hello" }] },
        { id: "fc_1", type: "function_call", call_id: "call_1", name: "add_widget", arguments: '{"type":"value"}' },
      ],
    };
    const ev = events(responseToSse(response));
    expect(ev.map((e: any) => e.type)).toEqual([
      "response.created",
      "response.output_item.added",
      "response.output_text.delta",
      "response.output_item.done",
      "response.output_item.added",
      "response.function_call_arguments.delta",
      "response.output_item.done",
      "response.completed",
    ]);
    expect(ev[2]).toMatchObject({ item_id: "msg_1", delta: "Hello" });
    expect(ev[4].item).toMatchObject({ id: "fc_1", call_id: "call_1", name: "add_widget", arguments: "" });
    expect(ev[5]).toMatchObject({ item_id: "fc_1", delta: '{"type":"value"}' });
    expect(ev[7].response).toEqual(response);
  });

  it("gives items without an id a stable one, and reports incomplete responses", () => {
    const ev = events(responseToSse({ status: "incomplete", output: [{ type: "function_call", call_id: "c", name: "n", arguments: "{}" }] }));
    expect(ev[1].item.id).toBe("item_0");
    expect(ev.at(-1).type).toBe("response.incomplete");
  });
});
