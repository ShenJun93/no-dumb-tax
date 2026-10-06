import { factSheet, formatDate, formatMoney, onlyKnownNumbers } from "./facts";
import type { Llm } from "./llm";
import type { Decision } from "./policy";
import type { SubscriptionFacts } from "./subscriptions";

export function templateReply(f: SubscriptionFacts, d: Decision, outcome: "done" | "queued" | "failed"): string {
  if (outcome === "failed") return "We could not finish this automatically. The merchant has your request and will answer you directly.";
  if (outcome === "queued" && d.cancel) {
    return "Your subscription is cancelled, so you will not be charged again. A person at the merchant will look at your refund request and answer you.";
  }
  if (outcome === "queued") return "Thanks — a person at the merchant will look at your request and answer you. Nothing has been charged or refunded yet because of this message.";
  const parts: string[] = [];
  if (d.refund) parts.push(`We refunded ${formatMoney(d.refund.amount, d.refund.currency)} to your PayPal account.`);
  if (d.cancel) parts.push("Your subscription is cancelled, so you will not be charged again.");
  if (!d.refund && !d.cancel) parts.push("Your subscription was already cancelled and there is no charge to refund.");
  if (!d.refund && f.inTrial && f.nextBillingTime) parts.push(`You were never charged; the first charge would have been on ${formatDate(f.nextBillingTime)}.`);
  return parts.join(" ");
}

const SYSTEM = `You write short, friendly customer-support replies for a subscription merchant.
Rewrite the given reply in the requested language. Keep its meaning exactly.
Use only the facts provided. Do not add amounts, dates, or promises that are not in the reply or the facts.
Answer with the reply text only.`;

export async function draftReply({
  facts,
  decision,
  outcome,
  language,
  llm,
}: {
  facts: SubscriptionFacts;
  decision: Decision;
  outcome: "done" | "queued" | "failed";
  language: string;
  llm: Llm;
}): Promise<{ text: string; source: "model" | "template" }> {
  const template = templateReply(facts, decision, outcome);
  try {
    const known = [...factSheet(facts), template];
    const text = (
      await llm.complete(SYSTEM, `Language: ${language}\nFacts:\n${known.join("\n")}\nReply to rewrite:\n${template}`, { maxTokens: 220 })
    ).trim();
    if (!text || !onlyKnownNumbers(text, known)) return { text: template, source: "template" };
    return { text, source: "model" };
  } catch {
    return { text: template, source: "template" };
  }
}
