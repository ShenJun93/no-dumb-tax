import type { Dashboard } from "../dashboard";

export interface FieldDef {
  id: string;
  name: string;
  format: "textFormat" | "integerFormat" | "decimalFormat" | "booleanFormat" | "dateTimeFormat" | "currencyFormat";
  formatOptions?: { format: string };
}

const usd = { format: "currencyFormat" as const, formatOptions: { format: "$#,##0.00" } };
const when = { format: "dateTimeFormat" as const, formatOptions: { format: "dd mmm yyyy HH:MM" } };

export const SOURCE_FIELDS: Record<"subscriptions" | "requests" | "audit" | "kpis", FieldDef[]> = {
  subscriptions: [
    { id: "id", name: "Subscription", format: "textFormat" },
    { id: "plan", name: "Plan", format: "textFormat" },
    { id: "status", name: "Status", format: "textFormat" },
    { id: "inTrial", name: "In trial", format: "booleanFormat" },
    { id: "nextCharge", name: "Next charge", ...when },
    { id: "hoursToCharge", name: "Hours to charge", format: "decimalFormat" },
    { id: "price", name: "Price", ...usd },
    { id: "charged", name: "Charged", ...usd },
    { id: "refunded", name: "Refunded", ...usd },
    { id: "reminderSent", name: "Reminder sent", format: "booleanFormat" },
  ],
  requests: [
    { id: "id", name: "Request", format: "textFormat" },
    { id: "subscriptionId", name: "Subscription", format: "textFormat" },
    { id: "createdAt", name: "Received", ...when },
    { id: "intent", name: "Intent", format: "textFormat" },
    { id: "status", name: "Status", format: "textFormat" },
    { id: "mode", name: "Decided by", format: "textFormat" },
    { id: "refundAmount", name: "Refund", ...usd },
    { id: "cancel", name: "Cancel", format: "booleanFormat" },
    { id: "reasons", name: "Rule reasons", format: "textFormat" },
    { id: "message", name: "Customer message", format: "textFormat" },
    { id: "currency", name: "Currency", format: "textFormat" },
    { id: "cancelled", name: "Already cancelled", format: "booleanFormat" },
    { id: "result", name: "Last result", format: "textFormat" },
  ],
  audit: [
    { id: "at", name: "Time", ...when },
    { id: "actor", name: "Actor", format: "textFormat" },
    { id: "action", name: "Action", format: "textFormat" },
    { id: "subscriptionId", name: "Subscription", format: "textFormat" },
    { id: "requestId", name: "Request", format: "textFormat" },
    { id: "detail", name: "Detail", format: "textFormat" },
  ],
  kpis: [
    { id: "activeTrials", name: "Active trials", format: "integerFormat" },
    { id: "chargesNext24h", name: "First charges in 24 h", format: "integerFormat" },
    { id: "amountNext24h", name: "Amount due in 24 h", ...usd },
    { id: "remindersSent", name: "Reminders shown", format: "integerFormat" },
    { id: "resolvedAutomatically", name: "Resolved automatically", format: "integerFormat" },
    { id: "refundedTotal", name: "Refunded", ...usd },
    { id: "pendingApprovals", name: "Waiting for you", format: "integerFormat" },
    { id: "disputes", name: "Disputes", format: "integerFormat" },
  ],
};

export function studioData(d: Dashboard) {
  return {
    sources: (Object.keys(SOURCE_FIELDS) as (keyof typeof SOURCE_FIELDS)[]).map((id) => ({ id, data: d[id] as unknown[], fields: SOURCE_FIELDS[id] })),
  };
}

type Ref = { id: string; aggregation?: "sum" | "count" | "countd" | "avg" };
type Widget = { type: string; dataMapping: Record<string, Ref[]>; format?: Record<string, unknown> };
type Layout = { xTrack: number; yTrack: number; xSpan: number; ySpan: number };
type Page = { id: string; name: string; widgets: Record<string, Widget>; widgetLayout: Record<string, Layout> };

const kpi = (field: string, title: string): Widget => ({
  type: "value",
  dataMapping: { value: [{ id: `kpis.${field}`, aggregation: "sum" }] },
  format: { title: { enabled: true, text: title } },
});
const grid = (source: keyof typeof SOURCE_FIELDS, fields: string[], title: string): Widget => ({
  type: "grid",
  dataMapping: { cols: fields.map((f) => ({ id: `${source}.${f}` })) },
  format: { title: { enabled: true, text: title } },
});

export function buildInitialState() {
  const overview: Page = {
    id: "overview",
    name: "Overview",
    widgets: {
      k1: kpi("activeTrials", "Active trials"),
      k2: kpi("chargesNext24h", "First charges in 24 h"),
      k3: kpi("amountNext24h", "Amount due in 24 h"),
      k4: kpi("resolvedAutomatically", "Resolved automatically"),
      k5: kpi("refundedTotal", "Refunded"),
      k6: kpi("pendingApprovals", "Waiting for you"),
      upcoming: grid("subscriptions", ["id", "plan", "status", "inTrial", "nextCharge", "hoursToCharge", "price", "reminderSent", "charged", "refunded"], "Trials and upcoming charges"),
    },
    widgetLayout: {
      k1: { xTrack: 0, yTrack: 0, xSpan: 4, ySpan: 5 },
      k2: { xTrack: 4, yTrack: 0, xSpan: 4, ySpan: 5 },
      k3: { xTrack: 8, yTrack: 0, xSpan: 4, ySpan: 5 },
      k4: { xTrack: 12, yTrack: 0, xSpan: 4, ySpan: 5 },
      k5: { xTrack: 16, yTrack: 0, xSpan: 4, ySpan: 5 },
      k6: { xTrack: 20, yTrack: 0, xSpan: 4, ySpan: 5 },
      upcoming: { xTrack: 0, yTrack: 5, xSpan: 24, ySpan: 14 },
    },
  };
  const approvals: Page = {
    id: "approvals",
    name: "Approvals",
    widgets: {
      queue: {
        type: "approvalQueue",
        dataMapping: { fields: ["id", "subscriptionId", "status", "refundAmount", "currency", "cancel", "cancelled", "reasons", "message", "result"].map((f) => ({ id: `requests.${f}` })) },
        format: { title: { enabled: true, text: "Waiting for you" } },
      },
      all: grid("requests", ["createdAt", "subscriptionId", "intent", "status", "mode", "refundAmount", "cancel", "reasons", "message"], "All customer requests"),
    },
    widgetLayout: {
      queue: { xTrack: 0, yTrack: 0, xSpan: 24, ySpan: 12 },
      all: { xTrack: 0, yTrack: 12, xSpan: 24, ySpan: 14 },
    },
  };
  const audit: Page = {
    id: "audit",
    name: "Audit log",
    widgets: { log: grid("audit", ["at", "actor", "action", "subscriptionId", "requestId", "detail"], "Every action and who took it") },
    widgetLayout: { log: { xTrack: 0, yTrack: 0, xSpan: 24, ySpan: 24 } },
  };
  return { pages: [overview, approvals, audit], selectedPageId: "overview", panels: { filters: { collapsed: true }, edit: { collapsed: true } } };
}

export function widgetFieldIds(state: ReturnType<typeof buildInitialState>): string[] {
  return state.pages.flatMap((p) => Object.values(p.widgets).flatMap((w) => Object.values(w.dataMapping).flatMap((refs) => refs.map((r) => r.id))));
}

/** A failed refresh keeps the last good data, so Studio (and its chat, widgets and page) stays mounted. */
export function nextConsoleData<T>(prev: T | undefined, fetched: T | undefined): T | undefined {
  return fetched ?? prev;
}
