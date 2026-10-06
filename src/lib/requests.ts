import { randomUUID } from "node:crypto";
import { classify } from "./intent";
import type { Llm } from "./llm";
import { decide, type Decision, type Intent } from "./policy";
import { getPolicy } from "./policy-store";
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
  /** The subscription was already cancelled for this request (a queued refund still waits for the merchant). */
  cancelled?: boolean;
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

async function cancelNow(d: Deps, r: CustomerRequest, actor: "auto" | "merchant"): Promise<string> {
  const c = await d.subs.cancel(r.subscriptionId, "Customer request via No Dumb Tax");
  r.cancelled = true;
  await audit(d, { requestId: r.id, subscriptionId: r.subscriptionId, action: "cancel", actor, detail: c });
  return `cancel: ${c}`;
}

async function execute(d: Deps, r: CustomerRequest, actor: "auto" | "merchant"): Promise<string> {
  const notes: string[] = [];
  if (r.decision.cancel && !r.cancelled) notes.push(await cancelNow(d, r, actor));
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
  const reqKey = input.requestKey ? `reqkey:${input.subscriptionId}:${input.requestKey}` : null;
  if (reqKey) {
    // Claim the key atomically so a double click cannot run the request twice.
    if (!(await d.store.setnx(reqKey, id, 86400))) {
      const existing = await d.store.get<string>(reqKey);
      const r = existing ? await d.store.get<CustomerRequest>(`req:${existing}`) : null;
      if (r) return r;
      throw new RequestBusy("This request is already being handled");
    }
  }
  // One request per subscription at a time: refund counters are read and written inside this lock.
  const lock = `lock:sub:${input.subscriptionId}`;
  if (!(await d.store.setnx(lock, id, 60))) {
    if (reqKey) await d.store.del(reqKey);
    throw new RequestBusy("Another request for this subscription is being handled. Please try again in a minute.");
  }
  try {
    return await processRequest(d, input, id);
  } catch (e) {
    if (reqKey) await d.store.del(reqKey);
    throw e;
  } finally {
    await d.store.del(lock);
  }
}

export class RequestBusy extends Error {}

async function processRequest(d: Deps, input: { subscriptionId: string; message: string }, id: string): Promise<CustomerRequest> {
  const facts = await d.subs.getFacts(input.subscriptionId, nowOf(d));
  const cls = await classify(input.message, d.llm);
  const priorRefunds = (await d.store.get<number>(`refunds:${input.subscriptionId}`)) ?? 0;
  const policy = await getPolicy(d.store);
  let decision = decide({ facts, intent: cls.intent, priorRefunds, now: nowOf(d), policy });
  if (cls.source === "fallback") {
    // The model could not read the message: show the merchant what a forgotten-trial request would get.
    const proposal = decide({ facts, intent: "forgot_to_cancel", priorRefunds, now: nowOf(d), policy });
    decision = { ...proposal, mode: "merchant", reasons: ["The assistant could not read this message; a person must decide.", ...proposal.reasons] };
  }
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
  try {
    if (decision.mode === "auto") r.result = await execute(d, r, "auto");
    // A customer who asked to stop is stopped now; only the refund waits for the merchant.
    else if (decision.mode === "merchant" && decision.cancel && cls.source === "model") r.result = await cancelNow(d, r, "auto");
  } catch (e) {
    r.status = "failed";
    r.result = (e as Error).message;
    outcome = "failed";
    await audit(d, { requestId: id, subscriptionId: r.subscriptionId, action: "error", actor: "auto", detail: r.result });
  }
  if (r.status === "pending" || r.status === "failed") await d.store.lpush("queue", id);
  await d.store.lpush("requests", id);
  const shown = outcome === "queued" ? { ...decision, cancel: r.cancelled === true } : decision;
  r.reply = (await draftReply({ facts, decision: shown, outcome, language: cls.language, llm: d.llm })).text;
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
