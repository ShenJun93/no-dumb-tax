import { services } from "@/lib/services";
import { applyWebhookEvent, verifyWebhook } from "@/lib/webhooks";

export async function POST(req: Request) {
  const raw = await req.text();
  const { pp, store, settings } = services();
  if (!(await verifyWebhook(pp, settings.paypalWebhookId, req.headers, raw))) return Response.json({ error: "Invalid signature" }, { status: 400 });
  return Response.json({ result: await applyWebhookEvent(store, JSON.parse(raw)) });
}
