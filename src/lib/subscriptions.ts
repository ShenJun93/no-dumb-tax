/* eslint-disable @typescript-eslint/no-explicit-any */
import { PayPalClient, PayPalError } from "./paypal";
import type { Payment } from "./policy";
import type { Store } from "./store";

export interface SubscriptionFacts {
  id: string;
  status: string;
  planId: string;
  planName: string;
  price: { value: string; currency: string };
  hadTrial: boolean;
  trialDays: number;
  inTrial: boolean;
  startTime: string;
  nextBillingTime: string | null;
  payments: Payment[];
}

interface Plan {
  id: string;
  name: string;
  billing_cycles: {
    tenure_type: string;
    frequency?: { interval_unit: string; interval_count: number };
    total_cycles?: number;
    pricing_scheme?: { fixed_price?: { value: string; currency_code: string } };
  }[];
}

const DAYS: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

export class SubscriptionService {
  constructor(
    private pp: PayPalClient,
    private store: Store,
  ) {}

  async createTrialPlan({ name, price, trialDays }: { name: string; price: string; trialDays: number }) {
    let productId = await this.store.get<string>("product");
    if (!productId) {
      const product = await this.pp.request<{ id: string }>("POST", "/v1/catalogs/products", {
        name: "No Dumb Tax demo SaaS",
        type: "SERVICE",
        category: "SOFTWARE",
      });
      productId = product.id;
      await this.store.set("product", productId);
    }
    const plan = await this.pp.request<{ id: string }>("POST", "/v1/billing/plans", {
      product_id: productId,
      name,
      billing_cycles: [
        { frequency: { interval_unit: "DAY", interval_count: trialDays }, tenure_type: "TRIAL", sequence: 1, total_cycles: 1 },
        {
          frequency: { interval_unit: "MONTH", interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 2,
          total_cycles: 0,
          pricing_scheme: { fixed_price: { value: price, currency_code: "USD" } },
        },
      ],
      payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 1 },
    });
    await this.store.sadd("plans", plan.id);
    return { productId, planId: plan.id };
  }

  private async plan(planId: string): Promise<Plan> {
    const cached = await this.store.get<Plan>(`plan:${planId}`);
    if (cached) return cached;
    const plan = await this.pp.request<Plan>("GET", `/v1/billing/plans/${planId}`);
    await this.store.set(`plan:${planId}`, plan, 86400);
    return plan;
  }

  async getFacts(id: string, now: Date = new Date()): Promise<SubscriptionFacts> {
    const sub = await this.pp.request<any>("GET", `/v1/billing/subscriptions/${encodeURIComponent(id)}`);
    const plan = await this.plan(sub.plan_id);
    const trial = plan.billing_cycles.find((c) => c.tenure_type === "TRIAL");
    const regular = plan.billing_cycles.find((c) => c.tenure_type === "REGULAR");
    const start = new Date(Date.parse(sub.start_time ?? now.toISOString()) - 86400_000).toISOString();
    const end = new Date(now.getTime() + 60_000).toISOString();
    const tx = await this.pp.request<any>(
      "GET",
      `/v1/billing/subscriptions/${encodeURIComponent(id)}/transactions?start_time=${start}&end_time=${end}`,
    );
    const payments: Payment[] = (tx.transactions ?? []).map((t: any) => ({
      id: t.id,
      status: t.status,
      amount: t.amount_with_breakdown?.gross_amount?.value ?? "0",
      currency: t.amount_with_breakdown?.gross_amount?.currency_code ?? "USD",
      time: t.time,
    }));
    const trialDays = trial?.frequency ? (DAYS[trial.frequency.interval_unit] ?? 0) * trial.frequency.interval_count : 0;
    const charged = payments.some((p) => Number(p.amount) > 0 && p.status !== "DECLINED");
    return {
      id: sub.id,
      status: sub.status,
      planId: plan.id,
      planName: plan.name,
      price: {
        value: regular?.pricing_scheme?.fixed_price?.value ?? "0",
        currency: regular?.pricing_scheme?.fixed_price?.currency_code ?? "USD",
      },
      hadTrial: Boolean(trial),
      trialDays,
      inTrial: Boolean(trial) && !charged && sub.status === "ACTIVE",
      startTime: sub.start_time,
      nextBillingTime: sub.billing_info?.next_billing_time ?? null,
      payments,
    };
  }

  /** Facts for dashboards: cached briefly so a page of subscriptions does not hit PayPal on every refresh. */
  async getFactsCached(id: string, now: Date = new Date(), ttlSec = 120): Promise<SubscriptionFacts> {
    const key = `facts:${id}`;
    const hit = await this.store.get<SubscriptionFacts>(key);
    if (hit) return hit;
    const facts = await this.getFacts(id, now);
    await this.store.set(key, facts, ttlSec);
    return facts;
  }

  async cancel(id: string, reason: string): Promise<"cancelled" | "already"> {
    try {
      await this.pp.request("POST", `/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, { reason: reason.slice(0, 127) });
      return "cancelled";
    } catch (e) {
      if (e instanceof PayPalError && e.status === 422 && e.issue === "SUBSCRIPTION_STATUS_INVALID") return "already";
      throw e;
    }
  }

  async refund(paymentId: string, amount: string, currency: string, requestId: string) {
    return this.pp.request<{ id: string; status: string }>(
      "POST",
      `/v2/payments/captures/${encodeURIComponent(paymentId)}/refund`,
      { amount: { value: amount, currency_code: currency }, note_to_payer: "Refund: you forgot to cancel your free trial." },
      { "PayPal-Request-Id": `refund-${requestId}` },
    );
  }
}
