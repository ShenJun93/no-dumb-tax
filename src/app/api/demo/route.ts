import { loadSettings } from "@/lib/config";

export async function GET() {
  const s = loadSettings();
  return Response.json({ clientId: s.paypalClientId, planId: process.env.DEMO_PLAN_ID ?? "" });
}
