import { portalTokenOk } from "@/lib/auth";
import { handleCustomerRequest } from "@/lib/requests";
import { services, type SubRecord } from "@/lib/services";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = services();
  const record = await ctx.store.get<SubRecord>(`sub:${id}`);
  if (!portalTokenOk(record?.portalToken, new URL(req.url).searchParams.get("t"))) return Response.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { message?: string; requestKey?: string };
  const message = String(body.message ?? "").trim();
  if (!message) return Response.json({ error: "Empty message" }, { status: 400 });
  const r = await handleCustomerRequest({ subs: ctx.subs, store: ctx.store, llm: ctx.llm }, { subscriptionId: id, message, requestKey: body.requestKey });
  return Response.json({ status: r.status, reply: r.reply });
}
