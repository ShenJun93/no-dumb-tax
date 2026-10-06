import { isMerchant } from "@/lib/auth";
import { getPolicy, PolicyError, savePolicy } from "@/lib/policy-store";
import { services } from "@/lib/services";

export async function GET(req: Request) {
  const { store, settings } = services();
  if (!isMerchant(req, settings.merchantToken)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await getPolicy(store));
}

export async function PUT(req: Request) {
  const { store, settings } = services();
  if (!isMerchant(req, settings.merchantToken)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await savePolicy(store, await req.json().catch(() => null)));
  } catch (e) {
    if (e instanceof PolicyError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
