import { isCron } from "@/lib/auth";
import { runDueReminders } from "@/lib/reminders";
import { services } from "@/lib/services";

export async function GET(req: Request) {
  const ctx = services();
  if (!isCron(req, ctx.settings.cronSecret)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const sent = await runDueReminders({ subs: ctx.subs, store: ctx.store, llm: ctx.llm, windowHours: ctx.settings.reminderWindowHours });
  return Response.json({ sent: sent.length });
}
