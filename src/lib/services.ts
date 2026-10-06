import { loadSettings } from "./config";
import { NebiusLlm } from "./llm";
import { PayPalClient } from "./paypal";
import { getStore } from "./store";
import { SubscriptionService } from "./subscriptions";

export type { SubRecord } from "./portal";

let paypal: PayPalClient | null = null;

export function services() {
  const settings = loadSettings();
  const store = getStore();
  paypal ??= new PayPalClient({ clientId: settings.paypalClientId, clientSecret: settings.paypalClientSecret, baseUrl: settings.paypalBaseUrl });
  const pp = paypal;
  const subs = new SubscriptionService(pp, store);
  const llm = new NebiusLlm({ apiKey: settings.nebiusApiKey, model: settings.nebiusModel, dailyCap: settings.llmDailyCap }, store);
  return { settings, store, pp, subs, llm };
}
