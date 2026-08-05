"use client";

import { useQueryState } from "nuqs";
import * as Tabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";

const TAB_KEYS = ["import", "export", "history"] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_LABEL: Record<TabKey, string> = {
  import: "Import",
  export: "Export",
  history: "Transfer log",
};

// Slot-based, same shape as SettingsTabs: the Server Component page renders
// each body and passes it in. All three mount with `forceMount` + `hidden` so
// switching is instant and the browser's find-in-page still reaches every
// column name in a collapsed spec table.
export function DataTabs(props: Record<TabKey, ReactNode> & { counts: Record<TabKey, number> }) {
  const [tab, setTab] = useQueryState("tab", {
    defaultValue: "import",
    parse: (v): TabKey =>
      (TAB_KEYS as readonly string[]).includes(v) ? (v as TabKey) : "import",
  });

  return (
    <Tabs.Root value={tab} onValueChange={(v) => setTab(v as TabKey)}>
      <Tabs.List
        className="mb-8 flex gap-1 border-b border-[rgba(15,23,42,0.08)] overflow-x-auto max-md:gap-0"
        aria-label="Import and export sections"
      >
        {TAB_KEYS.map((k) => (
          <Tabs.Trigger key={k} value={k} className="settings-tab-trigger">
            {TAB_LABEL[k]}
            <span className="ml-1.5 tabular-nums text-[12px] text-[#a2a8b4]">
              {props.counts[k]}
            </span>
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
