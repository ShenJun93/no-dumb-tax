import { randomUUID } from "node:crypto";
import type { Store } from "./store";
import type { SubscriptionService } from "./subscriptions";

export interface SubRecord {
  portalToken: string;
  language: string;
  createdAt: string;
}

/**
 * Registers a subscription right after the buyer approves it and returns its portal link.
 * The link (with its token) is handed out once: a subscription id alone must not open someone's portal.
 */
export async function registerSubscription(
  d: { store: Store; subs: Pick<SubscriptionService, "getFacts">; publicBaseUrl: string },
  input: { subscriptionId?: string; language?: string },
): Promise<{ status: number; body: { portalUrl?: string; error?: string } }> {
  const id = input.subscriptionId ?? "";
  if (!/^I-[A-Z0-9]{6,}$/.test(id)) return { status: 400, body: { error: "Invalid subscription id" } };
  const facts = await d.subs.getFacts(id).catch(() => null);
  if (!facts) return { status: 404, body: { error: "Subscription not found" } };
  if (!(await d.store.smembers("plans")).includes(facts.planId)) return { status: 403, body: { error: "Not one of this merchant's plans" } };
  const record: SubRecord = {
    portalToken: randomUUID(),
    language: (input.language ?? "en").slice(0, 2).toLowerCase(),
    createdAt: new Date().toISOString(),
  };
  if (!(await d.store.setnx(`sub:${id}`, record))) {
    return { status: 409, body: { error: "This subscription is already registered. Use the portal link you received." } };
  }
  await d.store.sadd("subs", id);
  return { status: 200, body: { portalUrl: `${d.publicBaseUrl}/portal/${id}?t=${record.portalToken}` } };
}
