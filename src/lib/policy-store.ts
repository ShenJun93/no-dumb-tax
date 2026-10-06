import { DEFAULT_POLICY, type RefundPolicy } from "./policy";
import type { Store } from "./store";

export class PolicyError extends Error {}

export async function getPolicy(store: Store): Promise<RefundPolicy> {
  return { ...DEFAULT_POLICY, ...((await store.get<Partial<RefundPolicy>>("policy")) ?? {}) };
}

export function validatePolicy(input: unknown): RefundPolicy {
  const p = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const hours = p.autoRefundWindowHours;
  const max = p.maxAutoRefunds;
  const first = p.onlyFirstCharge;
  if (typeof hours !== "number" || !Number.isInteger(hours) || hours < 1 || hours > 168) {
    throw new PolicyError("autoRefundWindowHours must be a whole number from 1 to 168");
  }
  if (typeof max !== "number" || !Number.isInteger(max) || max < 0 || max > 3) {
    throw new PolicyError("maxAutoRefunds must be a whole number from 0 to 3");
  }
  if (typeof first !== "boolean") throw new PolicyError("onlyFirstCharge must be true or false");
  return { autoRefundWindowHours: hours, maxAutoRefunds: max, onlyFirstCharge: first };
}

export async function savePolicy(store: Store, input: unknown): Promise<RefundPolicy> {
  const policy = validatePolicy(input);
  await store.set("policy", policy);
  await store.lpush("audit", {
    at: new Date().toISOString(),
    requestId: "-",
    subscriptionId: "-",
    action: "policy",
    actor: "merchant",
    detail: JSON.stringify(policy),
  });
  return policy;
}
