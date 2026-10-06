import { isMerchantBearer } from "@/lib/auth";
import { takeLlmBudget } from "@/lib/llm";
import { services } from "@/lib/services";
import { prepareStudioRequest, responseToSse } from "@/lib/studio-ai";

const SSE = { "Content-Type": "text/event-stream", "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const { store, settings } = services();
  if (!isMerchantBearer(req.headers.get("authorization"), settings.merchantToken)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await takeLlmBudget(store, settings.llmDailyCap))) return Response.json({ error: "Daily model budget reached" }, { status: 429 });
  const body = prepareStudioRequest(await req.json().catch(() => null), settings.studioModel);
  const r = await fetch("https://api.tokenfactory.nebius.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${settings.nebiusApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!r?.ok) {
    // Server log only: the upstream reason, never the key or the prompt.
    console.error("studio-ai upstream", r?.status ?? "timeout", r ? (await r.text()).slice(0, 600) : "");
    if (process.env.STUDIO_AI_DEBUG) console.error("studio-ai input kinds", JSON.stringify((body.input as { type?: string; role?: string }[] | undefined)?.map((i) => i.type ?? i.role)));
    const error = { type: "error", code: `upstream_${r?.status ?? "timeout"}`, message: "The model service failed. Try again." };
    return new Response(`data: ${JSON.stringify(error)}\n\n`, { headers: SSE });
  }
  return new Response(responseToSse(await r.json()), { headers: SSE });
}
