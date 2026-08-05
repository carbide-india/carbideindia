"use client";

import { useQueryState } from "nuqs";
import * as Tabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";

const TAB_KEYS = ["currencies", "credit", "exposure"] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_LABEL: Record<TabKey, string> = {
  currencies: "Currencies",
  credit: "Credit policy",
  exposure: "Credit exposure",
};

/**
 * Slot-based tabs, same contract as SettingsTabs: the Server Component renders
 * every body and passes it in, all three stay mounted so switching is instant.
 * Tab lives in the URL (nuqs) so a deep link lands on the right section.
 */
export function CurrencyWorkspace(props: Record<TabKey, ReactNode>) {
  const [tab, setTab] = useQueryState("tab", {
    defaultValue: "currencies",
    parse: (v): TabKey =>
      (TAB_KEYS as readonly string[]).includes(v) ? (v as TabKey) : "currencies",
  });

  return (
    <Tabs.Root value={tab} onValueChange={(v) => setTab(v as TabKey)}>
      <Tabs.List
        className="mb-6 flex gap-1 border-b border-[rgba(15,23,42,0.08)] overflow-x-auto max-md:gap-0"
        aria-label="Currency and credit sections"
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
