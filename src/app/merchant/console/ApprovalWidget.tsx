/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { actionLabel, pendingItems, type PendingItem } from "@/lib/console/approvals";
import { REFRESH_EVENT } from "./Console";

export function makeApprovalWidget(token: string) {
  return function ApprovalWidget(params: any) {
    const { dataMapping, widgetApi } = params;
    const [items, setItems] = useState<PendingItem[]>([]);
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
      const fields: any[] = dataMapping.fields ?? [];
      if (fields.length === 0) {
        widgetApi.setDisplayState("incompleteDataMapping");
        return;
      }
      widgetApi.setDisplayState("loading");
      widgetApi.getData({ fields }).then((response: any) => {
        const rows = response.results.rows.map((row: any) => Object.fromEntries(fields.map((f: any) => [String(f.fieldId ?? f.id).split(".").pop(), row[f.key]])));
        const pending = pendingItems(rows);
        setItems(pending);
        widgetApi.setDisplayState(pending.length ? "displayed" : "noData");
      });
    }, [params, dataMapping, widgetApi]);

    async function act(id: string, action: "approve" | "reject") {
      setBusy(id);
      await fetch(`/api/merchant/requests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-merchant-token": token },
        body: JSON.stringify({ action, note: action === "reject" ? "Rejected by merchant" : undefined }),
      });
      setBusy(null);
      window.dispatchEvent(new Event(REFRESH_EVENT));
    }

    return (
      <div style={{ padding: 8, overflow: "auto", height: "100%" }}>
        {items.map((it) => (
          <div key={it.id} className="card">
            <p>“{it.message}”</p>
            <p className="muted">
              {it.subscriptionId} · {it.status} — {it.reasons}
            </p>
            <button disabled={busy === it.id} onClick={() => act(it.id, "approve")}>
              {actionLabel(it)}
            </button>{" "}
            <button className="secondary" disabled={busy === it.id} onClick={() => act(it.id, "reject")}>
              Reject
            </button>
          </div>
        ))}
      </div>
    );
  };
}
