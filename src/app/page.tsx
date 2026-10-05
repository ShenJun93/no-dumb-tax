/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    paypal?: any;
  }
}

export default function Home() {
  const [error, setError] = useState("");
  const rendered = useRef(false);

  useEffect(() => {
    (async () => {
      const { clientId, planId } = await fetch("/api/demo").then((r) => r.json());
      if (!clientId || !planId) return setError("Demo plan is not configured.");
      const script = document.createElement("script");
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&vault=true&intent=subscription`;
      script.onload = () => {
        if (rendered.current || !window.paypal) return;
        rendered.current = true;
        window.paypal
          .Buttons({
            style: { label: "subscribe" },
            createSubscription: (_: unknown, actions: any) => actions.subscription.create({ plan_id: planId }),
            onApprove: async (data: { subscriptionID: string }) => {
              const r = await fetch("/api/subscriptions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subscriptionId: data.subscriptionID, language: navigator.language }),
              }).then((x) => x.json());
              if (r.portalUrl) window.location.href = r.portalUrl;
              else setError(r.error ?? "Could not register the subscription.");
            },
            onError: () => setError("PayPal could not start the subscription."),
          })
          .render("#paypal-button");
      };
      document.body.appendChild(script);
    })();
  }, []);

  return (
    <>
      <h1>Notely Pro — try it free for 1 day</h1>
      <p>A demo SaaS that sells a subscription with a free trial through PayPal (sandbox, no real money).</p>
      <div className="card notice">
        <strong>The honest version:</strong> after your free day you pay $9.99/month. We will remind you before the first charge, and you
        can cancel in one click. Forgot anyway? Tell us, and the obvious mistakes are refunded automatically.
      </div>
      <div id="paypal-button" />
      {error && <p className="danger">{error}</p>}
    </>
  );
}
