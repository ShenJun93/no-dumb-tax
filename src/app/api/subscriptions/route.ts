import { registerSubscription } from "@/lib/portal";
import { services } from "@/lib/services";

export async function POST(req: Request) {
  const input = (await req.json().catch(() => ({}))) as { subscriptionId?: string; language?: string };
  const { store, subs, settings } = services();
  const { status, body } = await registerSubscription({ store, subs, publicBaseUrl: settings.publicBaseUrl }, input);
  return Response.json(body, { status });
}
