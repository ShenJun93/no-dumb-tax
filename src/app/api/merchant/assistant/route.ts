import OpenAI from "openai";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";
import { askAssistant, PAYPAL_READ_ONLY_ACTIONS, type ChatCreate, type ToolkitLike } from "@/lib/assistant";
import { localTools } from "@/lib/assistant-tools";
import { isMerchant } from "@/lib/auth";
import { takeLlmBudget } from "@/lib/llm";
import { services } from "@/lib/services";

class OverBudget extends Error {}

export async function POST(req: Request) {
  const { store, subs, settings } = services();
  if (!isMerchant(req, settings.merchantToken)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { question } = (await req.json().catch(() => ({}))) as { question?: string };
  if (!question?.trim()) return Response.json({ error: "Empty question" }, { status: 400 });

  const client = new OpenAI({ apiKey: settings.nebiusApiKey, baseURL: "https://api.tokenfactory.nebius.com/v1/", timeout: 30_000, maxRetries: 1 });
  const create: ChatCreate = async (body) => {
    if (!(await takeLlmBudget(store, settings.llmDailyCap, new Date(), "console"))) throw new OverBudget("Daily model budget reached");
    return client.chat.completions.create(body);
  };
  const toolkit = new PayPalAgentToolkit({
    clientId: settings.paypalClientId,
    clientSecret: settings.paypalClientSecret,
    configuration: { actions: PAYPAL_READ_ONLY_ACTIONS, context: { sandbox: settings.paypalBaseUrl.includes("sandbox") } },
  }) as unknown as ToolkitLike;
  try {
    return Response.json(await askAssistant({ create, model: settings.nebiusModel, toolkit, local: localTools({ store, subs }) }, question));
  } catch (e) {
    if (e instanceof OverBudget) return Response.json({ error: e.message }, { status: 429 });
    return Response.json({ error: "The assistant is unavailable right now." }, { status: 502 });
  }
}
