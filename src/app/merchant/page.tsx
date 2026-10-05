/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useState } from "react";

async function readStoredToken(): Promise<string> {
  try {
    return localStorage.getItem("ndt-merchant") ?? "";
  } catch {
    return ""; // storage blocked
  }
}

export default function Merchant() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    readStoredToken().then(setToken);
  }, []);

  const fetchOverview = useCallback(async () => {
    if (!token) return null;
    const r = await fetch("/api/merchant/overview", { headers: { "x-merchant-token": token } });
    return r.ok ? await r.json() : { error: "Wrong token" };
  }, [token]);
  const load = () => fetchOverview().then(setData);

  useEffect(() => {
    fetchOverview().then(setData);
  }, [fetchOverview]);

  async function act(id: string, action: "approve" | "reject") {
    await fetch(`/api/merchant/requests/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-merchant-token": token },
      body: JSON.stringify({ action, note: action === "reject" ? "Rejected by merchant" : undefined }),
    });
    load();
  }

  async function runReminders() {
    await fetch("/api/merchant/reminders", { method: "POST", headers: { "x-merchant-token": token } });
    load();
  }

  return (
    <>
      <h1>Merchant console</h1>
      <input
        placeholder="Merchant token"
        value={token}
        onChange={(e) => {
          setToken(e.target.value);
          try {
            localStorage.setItem("ndt-merchant", e.target.value);
          } catch {
            /* storage blocked */
          }
        }}
      />
      {data?.error && <p className="danger">{data.error}</p>}
      {data && !data.error && (
        <>
          <p className="muted">
            Subscriptions: {data.counts.subscriptions} · Disputes: {data.counts.disputes}{" "}
            <button className="secondary" onClick={runReminders}>Run due reminders now</button>
          </p>
          <div className="card">
            <h2>Waiting for you</h2>
            {data.queue.length === 0 && <p className="muted">Nothing to approve.</p>}
            {data.queue.map((r: any) => (
              <div key={r.id} className="card">
                <p>“{r.message}”</p>
                <p className="muted">
                  {r.intent} · {r.decision.refund ? `refund ${r.decision.refund.amount} ${r.decision.refund.currency}` : "no refund"} ·{" "}
                  {r.decision.cancel ? "cancel" : "no cancel"} — {r.decision.reasons.join(" ")}
                </p>
                <button onClick={() => act(r.id, "approve")}>Approve</button>{" "}
                <button className="secondary" onClick={() => act(r.id, "reject")}>Reject</button>
              </div>
            ))}
          </div>
          <div className="card">
            <h2>Audit log</h2>
            <table>
              <tbody>
                {data.audit.map((a: any, i: number) => (
                  <tr key={i}>
                    <td>{a.at}</td>
                    <td>{a.actor}</td>
                    <td>{a.action}</td>
                    <td>{a.subscriptionId}</td>
                    <td>{a.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
