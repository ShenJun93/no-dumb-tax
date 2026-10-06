/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { createWidgets } from "ag-studio-react";
import { makeApprovalWidget } from "./ApprovalWidget";

/**
 * Studio widgets: the defaults plus the approval queue (id "approvalQueue", used by buildInitialState).
 * A function of Studio's default config, so the default widgets stay in the menu (the menu decides which
 * widget types can be added, including by the AI).
 */
export function approvalWidgets(token: string): any {
  return (defaults: any) => createWidgets({
    additionalTypes: [
      {
        id: "approvalQueue",
        label: "Approval queue",
        dataMapping: {
          fields: {
            type: "fieldset",
            supportedRoles: ["category", "numeric", "temporal"],
            requires: { cardinality: "many" },
            required: true,
          },
        },
        form: (params: any) => params.createDefaults({ dataMappingItems: [{ key: "fields", label: "Request fields" }] }),
        comp: makeApprovalWidget(token),
        defaultSize: { width: 900, height: 360 },
        minSize: { width: 320, height: 200 },
        ai: { description: "Customer requests waiting for the merchant, with Approve and Reject buttons." },
      },
    ],
    menu: [...defaults.menu, { label: "No Dumb Tax", widgetIds: ["approvalQueue"] }],
  } as any);
}
