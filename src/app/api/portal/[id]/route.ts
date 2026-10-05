import { portalTokenOk } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/facts";
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
  return Response.json({
    plan: f.planName,
    status: f.status,
    price: formatMoney(f.price.value, f.price.currency),
    inTrial: f.inTrial,
    nextCharge: f.nextBillingTime ? formatDate(f.nextBillingTime) : null,
    payments: f.payments.map((p) => ({ status: p.status, amount: formatMoney(p.amount, p.currency), at: formatDate(p.time) })),
    reminder: await ctx.store.get(`reminder:${id}`),
    requests: requests.map((r) => ({ at: r.createdAt, message: r.message, status: r.status, reply: r.reply })),
  });
}
