export interface PendingItem {
  id: string;
  subscriptionId: string;
  status: string;
  refundAmount: number;
  cancel: boolean;
  reasons: string;
  message: string;
}

export function pendingItems(rows: Record<string, unknown>[]): PendingItem[] {
  return rows
    .filter((r) => r.status === "pending" || r.status === "failed")
    .map((r) => ({
      id: String(r.id),
      subscriptionId: String(r.subscriptionId ?? ""),
      status: String(r.status),
      refundAmount: Number(r.refundAmount ?? 0) || 0,
      cancel: r.cancel === true || r.cancel === "true",
      reasons: String(r.reasons ?? ""),
      message: String(r.message ?? ""),
    }));
}

export function actionLabel(item: PendingItem): string {
  const parts: string[] = [];
  if (item.refundAmount > 0) parts.push(`refund $${item.refundAmount.toFixed(2)}`);
  if (item.cancel) parts.push("cancel");
  return parts.length ? `Approve: ${parts.join(" and ")}` : "Approve: no money moves";
}
