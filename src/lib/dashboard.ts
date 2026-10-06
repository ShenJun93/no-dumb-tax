import type { AuditEntry, CustomerRequest } from "./requests";
import type { Reminder } from "./reminders";
import type { Store } from "./store";
import type { SubscriptionFacts, SubscriptionService } from "./subscriptions";

export interface SubRow { id: string; plan: string; status: string; inTrial: boolean; nextCharge: string | null; hoursToCharge: number | null; price: number; charged: number; refunded: number; reminderSent: boolean }
export interface RequestRow { id: string; subscriptionId: string; createdAt: string; intent: string; status: string; mode: string; refundAmount: number; currency: string; cancel: boolean; cancelled: boolean; reasons: string; message: string; result: string }
export interface KpiRow { activeTrials: number; chargesNext24h: number; amountNext24h: number; remindersSent: number; resolvedAutomatically: number; refundedTotal: number; pendingApprovals: number; disputes: number }
export interface Dashboard { subscriptions: SubRow[]; requests: RequestRow[]; audit: AuditEntry[]; kpis: KpiRow[] }

const money = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

function requestRow(r: CustomerRequest): RequestRow {
  return {
    id: r.id,
    subscriptionId: r.subscriptionId,
    createdAt: r.createdAt,
    intent: r.intent,
    status: r.status,
    mode: r.decision.mode,
    refundAmount: r.decision.refund ? Number(r.decision.refund.amount) : 0,
    currency: r.decision.refund?.currency ?? "USD",
    cancel: r.decision.cancel,
    cancelled: r.cancelled === true,
    reasons: r.decision.reasons.join(" "),
    message: r.message,
    result: r.result ?? "",
  };
}

/** Runs `fn` over `items` with at most `limit` calls in flight; results keep the input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function listRequests(store: Store): Promise<RequestRow[]> {
  const ids = await store.lrange<string>("requests", 0, 199);
  const rows = await Promise.all(ids.map((id) => store.get<CustomerRequest>(`req:${id}`)));
  return rows.filter((r): r is CustomerRequest => Boolean(r)).map(requestRow);
}

export async function buildDashboard(d: { store: Store; subs: Pick<SubscriptionService, "getFactsCached">; now?: Date }): Promise<Dashboard> {
  const now = d.now ?? new Date();
  const requests = await listRequests(d.store);
  const refundedBySub = (sub: string) => money(requests.filter((r) => r.subscriptionId === sub && r.status === "done").map((r) => r.refundAmount));

  // PayPal lookups run a few at a time so a long list of subscriptions does not stall the console.
  const subscriptions = await mapLimit(await d.store.smembers("subs"), 5, async (id): Promise<SubRow> => {
    const reminderSent = Boolean(await d.store.get<Reminder>(`reminder:${id}`));
    let f: SubscriptionFacts;
    try {
      f = await d.subs.getFactsCached(id, now);
    } catch {
      return { id, plan: "", status: "UNKNOWN", inTrial: false, nextCharge: null, hoursToCharge: null, price: 0, charged: 0, refunded: refundedBySub(id), reminderSent };
    }
    const hoursToCharge = f.nextBillingTime ? Math.round(((Date.parse(f.nextBillingTime) - now.getTime()) / 3600_000) * 10) / 10 : null;
    return {
      id,
      plan: f.planName,
      status: f.status,
      inTrial: f.inTrial,
      nextCharge: f.nextBillingTime,
      hoursToCharge,
      price: Number(f.price.value),
      charged: money(f.payments.filter((p) => Number(p.amount) > 0 && p.status !== "DECLINED").map((p) => Number(p.amount))),
      refunded: refundedBySub(id),
      reminderSent,
    };
  });

  const due = subscriptions.filter((s) => s.inTrial && s.status === "ACTIVE" && s.hoursToCharge !== null && s.hoursToCharge >= 0 && s.hoursToCharge <= 24);
  const kpis: KpiRow[] = [
    {
      activeTrials: subscriptions.filter((s) => s.inTrial && s.status === "ACTIVE").length,
      chargesNext24h: due.length,
      amountNext24h: money(due.map((s) => s.price)),
      remindersSent: subscriptions.filter((s) => s.reminderSent).length,
      resolvedAutomatically: requests.filter((r) => r.status === "done" && r.mode === "auto").length,
      refundedTotal: money(requests.filter((r) => r.status === "done").map((r) => r.refundAmount)),
      pendingApprovals: requests.filter((r) => r.status === "pending" || r.status === "failed").length,
      disputes: (await d.store.get<number>("disputes")) ?? 0,
    },
  ];
  return { subscriptions, requests, audit: await d.store.lrange<AuditEntry>("audit", 0, 99), kpis };
}
