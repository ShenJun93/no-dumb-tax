import { portalTokenOk } from "@/lib/auth";
import { cancelByCustomer } from "@/lib/requests";
import { services, type SubRecord } from "@/lib/services";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = services();
  const record = await ctx.store.get<SubRecord>(`sub:${id}`);
  if (!portalTokenOk(record?.portalToken, new URL(req.url).searchParams.get("t"))) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ result: await cancelByCustomer({ subs: ctx.subs, store: ctx.store, llm: ctx.llm }, id) });
}
