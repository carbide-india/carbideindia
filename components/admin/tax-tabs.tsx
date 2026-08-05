"use client";

import { useQueryState } from "nuqs";
import * as Tabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";

const TAB_KEYS = ["rates", "hsn", "profile"] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_LABEL: Record<TabKey, string> = {
  rates: "Rates",
  hsn: "HSN Codes",
  profile: "GST Profile & Split",
};

/**
 * Slot-based tabs, same contract as SettingsTabs: the Server Component renders
 * every body and passes it in, all three stay mounted (`forceMount` + `hidden`)
 * so switching is instant and the tab lives in the URL.
 */
export function TaxTabs(props: Record<TabKey, ReactNode>) {
  const [tab, setTab] = useQueryState("tab", {
    defaultValue: "rates",
    parse: (v): TabKey =>
      (TAB_KEYS as readonly string[]).includes(v) ? (v as TabKey) : "rates",
  });

  return (
    <Tabs.Root value={tab} onValueChange={(v) => void setTab(v as TabKey)}>
      <Tabs.List
        className="mb-7 flex gap-1 overflow-x-auto border-b border-[rgba(15,23,42,0.08)] max-md:gap-0"
        aria-label="Tax and GST sections"
      >
        {TAB_KEYS.map((k) => (
          <Tabs.Trigger key={k} value={k} className="settings-tab-trigger">
            {TAB_LABEL[k]}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {TAB_KEYS.map((k) => (
        <Tabs.Content key={k} value={k} forceMount hidden={tab !== k}>
          {props[k]}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
