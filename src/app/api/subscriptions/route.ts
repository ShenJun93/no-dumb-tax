import { randomUUID } from "node:crypto";
import { services, type SubRecord } from "@/lib/services";

export async function POST(req: Request) {
  const { subscriptionId, language } = (await req.json().catch(() => ({}))) as { subscriptionId?: string; language?: string };
  if (!subscriptionId || !/^I-[A-Z0-9]{6,}$/.test(subscriptionId)) return Response.json({ error: "Invalid subscription id" }, { status: 400 });
  const { store, subs, settings } = services();
  const facts = await subs.getFacts(subscriptionId).catch(() => null);
  if (!facts) return Response.json({ error: "Subscription not found" }, { status: 404 });
  if (!(await store.smembers("plans")).includes(facts.planId)) return Response.json({ error: "Not one of this merchant's plans" }, { status: 403 });
  let record = await store.get<SubRecord>(`sub:${subscriptionId}`);
  if (!record) {
    record = { portalToken: randomUUID(), language: (language ?? "en").slice(0, 2).toLowerCase(), createdAt: new Date().toISOString() };
    await store.set(`sub:${subscriptionId}`, record);
    await store.sadd("subs", subscriptionId);
  }
  return Response.json({ portalUrl: `${settings.publicBaseUrl}/portal/${subscriptionId}?t=${record.portalToken}` });
}
