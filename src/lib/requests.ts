import { randomUUID } from "node:crypto";
import { classify } from "./intent";
import type { Llm } from "./llm";
import { decide, type Decision, type Intent } from "./policy";
import { draftReply } from "./reply";
import type { Store } from "./store";
import type { SubscriptionService } from "./subscriptions";

export interface CustomerRequest {
  id: string;
  subscriptionId: string;
  message: string;
  intent: Intent;
  language: string;
  decision: Decision;
  status: "done" | "pending" | "rejected" | "failed";
  reply: string;
  createdAt: string;
  result?: string;
}

export interface AuditEntry {
  at: string;
  requestId: string;
  subscriptionId: string;
  action: string;
  actor: "auto" | "merchant" | "customer";
  detail: string;
}

export interface Deps {
  subs: Pick<SubscriptionService, "getFacts" | "cancel" | "refund">;
  store: Store;
  llm: Llm;
  now?: () => Date;
}

const nowOf = (d: Deps) => (d.now ?? (() => new Date()))();

async function audit(d: Deps, e: Omit<AuditEntry, "at">) {
  await d.store.lpush("audit", { at: nowOf(d).toISOString(), ...e });
}

async function execute(d: Deps, r: CustomerRequest, actor: "auto" | "merchant"): Promise<string> {
  const notes: string[] = [];
  if (r.decision.cancel) {
    const c = await d.subs.cancel(r.subscriptionId, "Customer request via No Dumb Tax");
    notes.push(`cancel: ${c}`);
    await audit(d, { requestId: r.id, subscriptionId: r.subscriptionId, action: "cancel", actor, detail: c });
  }
  if (r.decision.refund) {
    const { paymentId, amount, currency } = r.decision.refund;
    const refund = await d.subs.refund(paymentId, amount, currency, r.id);
    await d.store.incr(`refunds:${r.subscriptionId}`);
    notes.push(`refund ${refund.id}: ${refund.status}`);
    await audit(d, { requestId: r.id, subscriptionId: r.subscriptionId, action: "refund", actor, detail: `${amount} ${currency} of ${paymentId} → ${refund.id} ${refund.status}` });
  }
  return notes.join("; ");
}

async function save(d: Deps, r: CustomerRequest) {
  await d.store.set(`req:${r.id}`, r);
}

export async function handleCustomerRequest(
  d: Deps,
  input: { subscriptionId: string; message: string; requestKey?: string },
): Promise<CustomerRequest> {
  const id = randomUUID();
  if (input.requestKey) {
    // Claim the key atomically so a double click cannot run the request twice.
    const key = `reqkey:${input.subscriptionId}:${input.requestKey}`;
    if (!(await d.store.setnx(key, id, 86400))) {
      const existing = await d.store.get<string>(key);
      const r = existing ? await d.store.get<CustomerRequest>(`req:${existing}`) : null;
      if (r) return r;
      throw new Error("This request is already being handled");
    }
  }

  const facts = await d.subs.getFacts(input.subscriptionId, nowOf(d));
  const cls = await classify(input.message, d.llm);
  const priorRefunds = (await d.store.get<number>(`refunds:${input.subscriptionId}`)) ?? 0;
  const decision = decide({ facts, intent: cls.intent, priorRefunds, now: nowOf(d) });
  const r: CustomerRequest = {
    id,
    subscriptionId: input.subscriptionId,
    message: input.message.slice(0, 2000),
    intent: cls.intent,
    language: cls.language,
    decision,
    status: decision.mode === "merchant" ? "pending" : "done",
    reply: "",
    createdAt: nowOf(d).toISOString(),
  };
  await audit(d, { requestId: id, subscriptionId: r.subscriptionId, action: "request", actor: "customer", detail: `${cls.intent} (${cls.source})` });

  let outcome: "done" | "queued" | "failed" = decision.mode === "merchant" ? "queued" : "done";
  if (decision.mode === "auto") {
    try {
      r.result = await execute(d, r, "auto");
    } catch (e) {
      r.status = "failed";
      r.result = (e as Error).message;
      outcome = "failed";
      await audit(d, { requestId: id, subscriptionId: r.subscriptionId, action: "error", actor: "auto", detail: r.result });
    }
  }
  if (r.status === "pending" || r.status === "failed") await d.store.lpush("queue", id);
  await d.store.lpush("requests", id);
  r.reply = (await draftReply({ facts, decision, outcome, language: cls.language, llm: d.llm })).text;
  await save(d, r);
  return r;
}

async function loadPending(d: Deps, id: string): Promise<CustomerRequest> {
  const r = await d.store.get<CustomerRequest>(`req:${id}`);
  if (!r) throw new Error("Request not found");
  if (r.status !== "pending" && r.status !== "failed") throw new Error("Request is not pending");
  return r;
}

export async function approveRequest(d: Deps, id: string): Promise<CustomerRequest> {
  const r = await loadPending(d, id);
  await d.store.lrem("queue", id);
  try {
    r.result = await execute(d, r, "merchant");
    r.status = "done";
  } catch (e) {
    r.status = "failed";
    r.result = (e as Error).message;
    await d.store.lpush("queue", id);
  }
  await save(d, r);
  return r;
}

export async function rejectRequest(d: Deps, id: string, note: string): Promise<CustomerRequest> {
  const r = await loadPending(d, id);
  await d.store.lrem("queue", id);
  r.status = "rejected";
  r.result = note.slice(0, 500);
  await audit(d, { requestId: id, subscriptionId: r.subscriptionId, action: "reject", actor: "merchant", detail: r.result });
  await save(d, r);
  return r;
}

export async function cancelByCustomer(d: Deps, subscriptionId: string): Promise<"cancelled" | "already"> {
  const c = await d.subs.cancel(subscriptionId, "Cancelled by the customer in one click");
  await audit(d, { requestId: "-", subscriptionId, action: "cancel", actor: "customer", detail: c });
  return c;
}
