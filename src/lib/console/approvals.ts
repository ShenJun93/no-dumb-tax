export interface PendingItem {
  id: string;
  subscriptionId: string;
  status: string;
  refundAmount: number;
  currency: string;
  cancel: boolean;
  /** The subscription was already cancelled when the request was queued. */
  cancelled: boolean;
  reasons: string;
  message: string;
  /** Why an earlier attempt failed, if it did. */
  result: string;
}

const bool = (v: unknown) => v === true || v === "true";

export function pendingItems(rows: Record<string, unknown>[]): PendingItem[] {
  return rows
    .filter((r) => r.status === "pending" || r.status === "failed")
    .map((r) => ({
      id: String(r.id),
      subscriptionId: String(r.subscriptionId ?? ""),
      status: String(r.status),
      refundAmount: Number(r.refundAmount ?? 0) || 0,
      currency: String(r.currency ?? "USD"),
      cancel: bool(r.cancel),
      cancelled: bool(r.cancelled),
      reasons: String(r.reasons ?? ""),
      message: String(r.message ?? ""),
      result: String(r.result ?? ""),
    }));
}

const amount = (value: number, currency: string) => (currency === "USD" ? `$${value.toFixed(2)}` : `${value.toFixed(2)} ${currency}`);

/** What Approve will actually do: the refund, and a cancel only if it has not happened yet. */
export function actionLabel(item: PendingItem): string {
  const parts: string[] = [];
  if (item.refundAmount > 0) parts.push(`refund ${amount(item.refundAmount, item.currency)}`);
  if (item.cancel && !item.cancelled) parts.push("cancel");
  return parts.length ? `Approve: ${parts.join(" and ")}` : "Approve: no money moves";
}

/** The message shown under a card after Approve or Reject. */
export function approvalMessage(status: number, body: { status?: string; result?: string; error?: string } | null): string {
  if (status < 200 || status >= 300) return body?.error ?? `Something went wrong (${status}). Nothing new was refunded.`;
  if (body?.status === "failed") return `PayPal could not finish it: ${body.result ?? "unknown error"}`;
  if (body?.status === "rejected") return "Rejected.";
  return "Done.";
}
