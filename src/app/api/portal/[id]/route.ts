import { portalTokenOk } from "@/lib/auth";
import { portalView } from "@/lib/portal";
import { runDueReminders } from "@/lib/reminders";
import type { CustomerRequest } from "@/lib/requests";
import { services, type SubRecord } from "@/lib/services";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = services();
  const record = await ctx.store.get<SubRecord>(`sub:${id}`);
  if (!portalTokenOk(record?.portalToken, new URL(req.url).searchParams.get("t"))) return Response.json({ error: "Not found" }, { status: 404 });
  await runDueReminders({ subs: ctx.subs, store: ctx.store, llm: ctx.llm, windowHours: ctx.settings.reminderWindowHours }, [id]);
  const f = await ctx.subs.getFacts(id);
  const ids = await ctx.store.lrange<string>("requests", 0, 200);
  const requests: CustomerRequest[] = [];
  for (const rid of ids) {
    const r = await ctx.store.get<CustomerRequest>(`req:${rid}`);
    if (r?.subscriptionId === id) requests.push(r);
  }
  return Response.json(portalView(f, (await ctx.store.get<{ text: string }>(`reminder:${id}`)) ?? null, requests));
}
