"use client";

import { useCallback, useEffect, useState } from "react";

type View = {
  plan: string;
  status: string;
  price: string;
  inTrial: boolean;
  nextCharge: string | null;
  payments: { status: string; amount: string; at: string }[];
  reminder: { text: string } | null;
  requests: { at: string; message: string; status: string; reply: string }[];
};

export default function Portal({ id, token }: { id: string; token: string }) {
  const [view, setView] = useState<View | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");
  const q = `?t=${encodeURIComponent(token)}`;

  const fetchView = useCallback(async (): Promise<View | null> => {
    const r = await fetch(`/api/portal/${id}${q}`);
    return r.ok ? await r.json() : null;
  }, [id, q]);
  const load = () => fetchView().then(setView);

  useEffect(() => {
    fetchView().then(setView);
  }, [fetchView]);

  async function cancel() {
    setBusy(true);
    await fetch(`/api/portal/${id}/cancel${q}`, { method: "POST" });
    setBusy(false);
    load();
  }

  async function send() {
    setBusy(true);
    const r = await fetch(`/api/portal/${id}/request${q}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, requestKey: crypto.randomUUID() }),
    }).then((x) => x.json());
    setReply(r.reply ?? r.error ?? "");
    setBusy(false);
    setMessage("");
    load();
  }

  if (!view) return <p>Loading your subscription…</p>;
  return (
    <>
      <h1>Your subscription: {view.plan}</h1>
      <p>
        Status: <strong>{view.status}</strong> · {view.price}/month
      </p>
      {view.reminder && <div className="card notice">{view.reminder.text}</div>}
      {view.inTrial && view.nextCharge && <p>Free trial — first charge on {view.nextCharge}.</p>}
      {view.status === "ACTIVE" && (
        <button onClick={cancel} disabled={busy}>
          Cancel in one click
        </button>
      )}
      <div className="card">
        <h2>Charges</h2>
        {view.payments.length === 0 ? <p className="muted">No charges yet.</p> : (
          <table>
            <tbody>
              {view.payments.map((p, i) => (
                <tr key={i}>
                  <td>{p.at}</td>
                  <td>{p.amount}</td>
                  <td>{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h2>Forgot to cancel? Tell us in your own words</h2>
        <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Any language is fine." />
        <p>
          <button onClick={send} disabled={busy || !message.trim()}>
            Send
          </button>
        </p>
        {reply && <p className="notice card">{reply}</p>}
        {view.requests.map((r, i) => (
          <p key={i} className="muted">
            {r.at}: “{r.message}” → {r.status}
            {r.reply ? ` · ${r.reply}` : ""}
          </p>
        ))}
      </div>
    </>
  );
}
