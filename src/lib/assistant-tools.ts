import type { LocalTool } from "./assistant";
import { buildDashboard } from "./dashboard";
import { getPolicy } from "./policy-store";
import type { Store } from "./store";
import type { SubscriptionService } from "./subscriptions";

const noArgs = { type: "object", properties: {}, additionalProperties: false };

export function localTools(d: { store: Store; subs: Pick<SubscriptionService, "getFactsCached"> }): LocalTool[] {
  return [
    {
      name: "dashboard_summary",
      description: "Key numbers (active trials, charges in the next 24 hours, refunds, pending approvals, disputes) and every subscription with its next charge.",
      parameters: noArgs,
      run: async () => {
        const dash = await buildDashboard(d);
        return { kpis: dash.kpis[0], subscriptions: dash.subscriptions.slice(0, 30) };
      },
    },
    {
      name: "pending_requests",
      description: "Customer requests waiting for the merchant, with the proposed action and the rule-based reasons.",
      parameters: noArgs,
      run: async () => (await buildDashboard(d)).requests.filter((r) => r.status === "pending" || r.status === "failed").slice(0, 20),
    },
    {
      name: "refund_policy",
      description: "The merchant's current automatic refund rules.",
      parameters: noArgs,
      run: async () => getPolicy(d.store),
    },
  ];
}
