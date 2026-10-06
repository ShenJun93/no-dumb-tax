import { isMerchant } from "@/lib/auth";
import { buildDashboard } from "@/lib/dashboard";
import { services } from "@/lib/services";

export async function GET(req: Request) {
  const { store, subs, settings } = services();
  if (!isMerchant(req, settings.merchantToken)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await buildDashboard({ store, subs }));
}
