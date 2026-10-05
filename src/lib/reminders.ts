import { factSheet, formatDate, formatMoney, onlyKnownNumbers } from "./facts";
import type { Llm } from "./llm";
import type { Store } from "./store";
import type { SubscriptionFacts, SubscriptionService } from "./subscriptions";

export interface Reminder {
  subscriptionId: string;
  text: string;
  source: "model" | "template";
  sentAt: string;
  chargeAt: string;
}

export function isReminderDue(f: SubscriptionFacts, now: Date, windowHours: number): boolean {
  if (!f.inTrial || f.status !== "ACTIVE" || !f.nextBillingTime) return false;
  const charge = Date.parse(f.nextBillingTime);
  return now.getTime() >= charge - windowHours * 3600_000 && now.getTime() < charge;
}

export function templateReminder(f: SubscriptionFacts): string {
  return `Heads-up: your free trial of ${f.planName} ends soon. On ${formatDate(f.nextBillingTime!)} you will be charged ${formatMoney(f.price.value, f.price.currency)}. Not using it? Cancel in one click below and you will pay nothing.`;
}

const SYSTEM = `Translate the reminder into the requested language for a subscription customer.
Keep every date, time and amount exactly as written. Add nothing. Answer with the reminder only.`;

export async function reminderText(f: SubscriptionFacts, language: string, llm: Llm) {
  const template = templateReminder(f);
  if (language === "en") return { text: template, source: "template" as const };
  try {
    const text = (await llm.complete(SYSTEM, `Language: ${language}\nReminder:\n${template}`, { maxTokens: 200 })).trim();
    if (!text || !onlyKnownNumbers(text, [...factSheet(f), template])) return { text: template, source: "template" as const };
    return { text, source: "model" as const };
  } catch {
    return { text: template, source: "template" as const };
  }
}

export async function runDueReminders(
  deps: { subs: Pick<SubscriptionService, "getFacts">; store: Store; llm: Llm; now?: () => Date; windowHours: number },
  ids?: string[],
): Promise<Reminder[]> {
  const now = (deps.now ?? (() => new Date()))();
  const sent: Reminder[] = [];
  for (const id of ids ?? (await deps.store.smembers("subs"))) {
    let facts: SubscriptionFacts;
    try {
      facts = await deps.subs.getFacts(id, now);
    } catch {
      continue;
    }
    if (!isReminderDue(facts, now, deps.windowHours)) continue;
    const previous = await deps.store.get<Reminder>(`reminder:${id}`);
    if (previous && previous.chargeAt === facts.nextBillingTime) continue;
    const language = (await deps.store.get<{ language: string }>(`sub:${id}`))?.language ?? "en";
    const { text, source } = await reminderText(facts, language, deps.llm);
    const reminder: Reminder = { subscriptionId: id, text, source, sentAt: now.toISOString(), chargeAt: facts.nextBillingTime! };
    await deps.store.set(`reminder:${id}`, reminder);
    await deps.store.lpush("audit", { at: reminder.sentAt, requestId: "-", subscriptionId: id, action: "reminder", actor: "auto", detail: `charge at ${reminder.chargeAt}` });
    sent.push(reminder);
  }
  return sent;
}
