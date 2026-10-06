/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { studioTheme } from "ag-studio";
import { buildInitialState, studioData } from "@/lib/console/studio-state";

export const REFRESH_EVENT = "ndt:refresh";

const theme = studioTheme.withParams(
  { accentColor: "#0b6b3a", backgroundColor: "#ffffff", foregroundColor: "#1d1d1b", browserColorScheme: "light" },
  "no-dumb-tax",
);

export default function Console({ token, widgets, ai }: { token: string; widgets?: any; ai?: any }) {
  const [data, setData] = useState<any>(undefined);
  const initialState = useMemo(() => buildInitialState(), []);

  const fetchDashboard = useCallback(async () => {
    const r = await fetch("/api/merchant/dashboard", { headers: { "x-merchant-token": token } });
    return r.ok ? studioData(await r.json()) : undefined;
  }, [token]);

  useEffect(() => {
    const refresh = () => fetchDashboard().then(setData);
    refresh();
    const timer = setInterval(refresh, 30_000);
    window.addEventListener(REFRESH_EVENT, refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener(REFRESH_EVENT, refresh);
    };
  }, [fetchDashboard]);

  if (!data) return <p className="muted">Loading the console…</p>;
  return (
    <AgStudioProvider licenseKey={process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE || undefined} modules={ai ? ai.modules : undefined}>
      <div style={{ height: "80vh", width: "100%" }}>
        <AgStudio data={data} initialState={initialState as any} theme={theme} widgets={widgets} ai={ai?.ai} mode="edit" />
      </div>
    </AgStudioProvider>
  );
}
