export const APP_NAME = "No Dumb Tax";

export interface Settings {
  paypalClientId: string;
  paypalClientSecret: string;
  paypalBaseUrl: string;
  paypalWebhookId: string;
  nebiusApiKey: string;
  nebiusModel: string;
  studioModel: string;
  llmDailyCap: number;
  merchantToken: string;
  cronSecret: string;
  reminderWindowHours: number;
  publicBaseUrl: string;
}

export function loadSettings(env: Record<string, string | undefined> = process.env): Settings {
  const get = (k: string, d = "") => (env[k] ?? d).trim();
  return {
    paypalClientId: get("PAYPAL_CLIENT_ID"),
    paypalClientSecret: get("PAYPAL_CLIENT_SECRET"),
    paypalBaseUrl: get("PAYPAL_BASE_URL", "https://api-m.sandbox.paypal.com"),
    paypalWebhookId: get("PAYPAL_WEBHOOK_ID"),
    nebiusApiKey: get("NEBIUS_API_KEY"),
    nebiusModel: get("NEBIUS_MODEL", "Qwen/Qwen3-30B-A3B-Instruct-2507"),
    studioModel: get("NEBIUS_STUDIO_MODEL", "Qwen/Qwen3-30B-A3B-Instruct-2507"),
    llmDailyCap: Number(get("LLM_DAILY_CAP", "200")),
    merchantToken: get("MERCHANT_TOKEN"),
    cronSecret: get("CRON_SECRET"),
    reminderWindowHours: Number(get("REMINDER_WINDOW_HOURS", "48")),
    publicBaseUrl: get("PUBLIC_BASE_URL", "http://localhost:3000"),
  };
}
