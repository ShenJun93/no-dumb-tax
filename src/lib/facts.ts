import type { SubscriptionFacts } from "./subscriptions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatMoney(value: string, currency: string): string {
  return currency === "USD" ? `$${value}` : `${value} ${currency}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

/** Every human-readable fact the model may mention. Numbers outside these are not allowed. */
export function factSheet(f: SubscriptionFacts): string[] {
  const lines = [
    `Plan: ${f.planName}, ${formatMoney(f.price.value, f.price.currency)} per month after a ${f.trialDays}-day free trial`,
    `Status: ${f.status}`,
  ];
  if (f.nextBillingTime) lines.push(`Next charge: ${formatDate(f.nextBillingTime)}`);
  for (const p of f.payments) lines.push(`Charge ${p.status}: ${formatMoney(p.amount, p.currency)} on ${formatDate(p.time)}`);
  return lines;
}

export function numbersIn(text: string): string[] {
  return text.match(/\d+(?:[.,]\d+)?/g)?.map((n) => n.replace(",", ".")) ?? [];
}

export function onlyKnownNumbers(text: string, known: string[]): boolean {
  const allowed = new Set(known.flatMap(numbersIn));
  for (const n of numbersIn(text)) {
    if (!allowed.has(n) && !allowed.has(String(Number(n)))) return false;
  }
  return true;
}
