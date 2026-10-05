import { isMerchant } from "@/lib/auth";
import type { CustomerRequest } from "@/lib/requests";
import { services } from "@/lib/services";

export async function GET(req: Request) {
  const { store, settings } = services();
  if (!isMerchant(req, settings.merchantToken)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const queueIds = await store.lrange<string>("queue", 0, 100);
  const queue = (await Promise.all(queueIds.map((id) => store.get<CustomerRequest>(`req:${id}`)))).filter(Boolean);
  return Response.json({
    queue,
    audit: await store.lrange("audit", 0, 49),
    events: await store.lrange("events", 0, 49),
    counts: {
      subscriptions: (await store.smembers("subs")).length,
      disputes: (await store.get<number>("disputes")) ?? 0,
    },
  });
}
