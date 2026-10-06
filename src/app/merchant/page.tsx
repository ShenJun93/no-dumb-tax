/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import PolicyPanel from "./console/PolicyPanel";

const Console = dynamic(() => import("./console/Console"), { ssr: false, loading: () => <p className="muted">Loading the console…</p> });

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

  useEffect(() => {
    fetchOverview().then(setData);
  }, [fetchOverview]);

  // Studio widgets and AI are browser-only modules; build them once per token.
  const [extras, setExtras] = useState<{ widgets: unknown; ai: unknown } | null>(null);
  useEffect(() => {
    if (!token) return;
    Promise.all([import("./console/widgets"), import("./console/ai")]).then(([w, a]) =>
      setExtras({ widgets: w.approvalWidgets(token), ai: a.studioAi(token) }),
    );
  }, [token]);

  async function runReminders() {
    await fetch("/api/merchant/reminders", { method: "POST", headers: { "x-merchant-token": token } });
    window.dispatchEvent(new Event("ndt:refresh"));
  }

  return (
    <div className="wide">
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
            <button className="secondary" onClick={runReminders}>Run due reminders now</button>
          </p>
          {extras && <Console token={token} widgets={extras.widgets} ai={extras.ai} />}
          <PolicyPanel token={token} />
        </>
      )}
    </div>
  );
}
