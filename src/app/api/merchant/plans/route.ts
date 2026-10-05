import { isMerchant } from "@/lib/auth";
import { services } from "@/lib/services";

export async function POST(req: Request) {
  const { subs, settings } = services();
  if (!isMerchant(req, settings.merchantToken)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { name, price, trialDays } = (await req.json().catch(() => ({}))) as { name?: string; price?: string; trialDays?: number };
  if (!name || !/^\d+(\.\d{2})?$/.test(price ?? "") || !Number.isInteger(trialDays) || trialDays! < 1) {
    return Response.json({ error: "name, price like 9.99 and trialDays >= 1 are required" }, { status: 400 });
  }
  return Response.json(await subs.createTrialPlan({ name, price: price!, trialDays: trialDays! }));
}
