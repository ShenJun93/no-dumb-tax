"use client";

import { useEffect, useState } from "react";

type Policy = { autoRefundWindowHours: number; maxAutoRefunds: number; onlyFirstCharge: boolean };

async function loadPolicy(token: string): Promise<Policy | null> {
  const r = await fetch("/api/merchant/policy", { headers: { "x-merchant-token": token } });
  return r.ok ? r.json() : null;
}

export default function PolicyPanel({ token }: { token: string }) {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    loadPolicy(token).then(setPolicy);
  }, [token]);

  async function send(method: "PUT" | "DELETE", okNote: string) {
    const r = await fetch("/api/merchant/policy", {
      method,
      headers: { "Content-Type": "application/json", "x-merchant-token": token },
      body: method === "PUT" ? JSON.stringify(policy) : undefined,
    }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    setNote(r?.ok ? okNote : (j?.error ?? "Could not save. Try again."));
    if (r?.ok && j) setPolicy(j);
  }

  const save = () => send("PUT", "Saved. New requests use these rules.");
  const restore = () => send("DELETE", "Back to the default rules.");

  if (!policy) return null;
  return (
    <div className="card">
      <h2>Automatic refund rules</h2>
      <p className="muted">Requests outside these rules wait for your approval. The assistant cannot change them.</p>
      <label>
        Refund automatically if the charge is at most{" "}
        <input type="number" min={1} max={168} style={{ width: 80 }} value={policy.autoRefundWindowHours}
          onChange={(e) => setPolicy({ ...policy, autoRefundWindowHours: Number(e.target.value) })} /> hours old
      </label>
      <p>
        <label>
          At most <input type="number" min={0} max={3} style={{ width: 60 }} value={policy.maxAutoRefunds}
            onChange={(e) => setPolicy({ ...policy, maxAutoRefunds: Number(e.target.value) })} /> automatic refund(s) per subscription
        </label>
      </p>
      <p>
        <label>
          <input type="checkbox" style={{ width: "auto" }} checked={policy.onlyFirstCharge}
            onChange={(e) => setPolicy({ ...policy, onlyFirstCharge: e.target.checked })} /> Only the first charge after a free trial
        </label>
      </p>
      <button onClick={save}>Save rules</button>{" "}
      <button className="secondary" onClick={restore}>Restore defaults</button> <span className="muted">{note}</span>
    </div>
  );
}
