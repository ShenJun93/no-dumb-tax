export type Intent = "forgot_to_cancel" | "cancel_only" | "other" | "abuse";

export interface Payment {
  id: string;
  status: string; // COMPLETED, REFUNDED, PARTIALLY_REFUNDED, DECLINED, PENDING
  amount: string;
  currency: string;
  time: string;
}

export interface PolicyFacts {
  status: string;
  hadTrial: boolean;
  payments: Payment[];
  /** The plan's regular price; a charge of any other amount is a billing question, not a forgotten trial. */
  price?: { value: string; currency: string };
}

export interface RefundPolicy {
  autoRefundWindowHours: number;
  maxAutoRefunds: number;
  onlyFirstCharge: boolean;
}

export const DEFAULT_POLICY: RefundPolicy = { autoRefundWindowHours: 48, maxAutoRefunds: 1, onlyFirstCharge: true };

export interface Decision {
  cancel: boolean;
  refund: { paymentId: string; amount: string; currency: string } | null;
  mode: "auto" | "merchant" | "none";
  reasons: string[];
}

const CANCELLABLE = new Set(["ACTIVE", "SUSPENDED", "APPROVED"]);

export function lastCompletedPayment(payments: Payment[]): Payment | null {
  const done = payments.filter((p) => p.status === "COMPLETED" && Number(p.amount) > 0);
  done.sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  return done[0] ?? null;
}

export function decide({
  facts,
  intent,
  priorRefunds,
  now,
  policy = DEFAULT_POLICY,
}: {
  facts: PolicyFacts;
  intent: Intent;
  priorRefunds: number;
  now: Date;
  policy?: RefundPolicy;
}): Decision {
  const cancel = CANCELLABLE.has(facts.status);
  if (intent === "abuse") {
    return { cancel: false, refund: null, mode: "merchant", reasons: ["The message tries to steer the assistant; a person must read it."] };
  }
  if (intent === "other") {
    return { cancel: false, refund: null, mode: "merchant", reasons: ["Not a cancellation or forgotten-trial request."] };
  }
  if (intent === "cancel_only") {
    return { cancel, refund: null, mode: cancel ? "auto" : "none", reasons: cancel ? ["Cancel requested."] : ["Already not active."] };
  }

  const last = lastCompletedPayment(facts.payments);
  if (!last) {
    return { cancel, refund: null, mode: cancel ? "auto" : "none", reasons: ["No completed charge to refund."] };
  }
  const refund = { paymentId: last.id, amount: last.amount, currency: last.currency };
  const reasons: string[] = [];
  const ageHours = (now.getTime() - Date.parse(last.time)) / 3600_000;
  if (!facts.hadTrial) reasons.push("The plan had no free trial.");
  if (ageHours > policy.autoRefundWindowHours) reasons.push(`The charge is older than ${policy.autoRefundWindowHours} hours.`);
  if (priorRefunds >= policy.maxAutoRefunds) reasons.push("This customer already received an automatic refund.");
  if (facts.price && (facts.price.currency !== last.currency || Math.abs(Number(facts.price.value) - Number(last.amount)) > 0.005)) {
    reasons.push(`The charge (${last.amount} ${last.currency}) differs from the plan price (${facts.price.value} ${facts.price.currency}).`);
  }
  const completed = facts.payments.filter((p) => Number(p.amount) > 0 && p.status !== "DECLINED");
  if (policy.onlyFirstCharge && completed.length > 1) reasons.push("This is not the first charge after the trial.");

  if (reasons.length === 0) {
    return { cancel, refund, mode: "auto", reasons: ["First charge after a free trial, within the automatic window."] };
  }
  return { cancel, refund, mode: "merchant", reasons };
}
