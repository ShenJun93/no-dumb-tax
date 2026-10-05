import { isMerchant } from "@/lib/auth";
import { approveRequest, rejectRequest } from "@/lib/requests";
import { services } from "@/lib/services";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = services();
  if (!isMerchant(req, ctx.settings.merchantToken)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { action, note } = (await req.json().catch(() => ({}))) as { action?: string; note?: string };
  const deps = { subs: ctx.subs, store: ctx.store, llm: ctx.llm };
  try {
    if (action === "approve") return Response.json(await approveRequest(deps, id));
    if (action === "reject") return Response.json(await rejectRequest(deps, id, note ?? ""));
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
