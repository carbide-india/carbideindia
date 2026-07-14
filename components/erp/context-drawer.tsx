"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ContextDrawer (ERP redesign - Phase 3).
 *
 * The consolidated right-side slide-over (Sheet) that replaces the hand-rolled
 * quick-view popups. Built on Radix Dialog (same pattern as the command palette
 * / global search) so it is focus-trapped, closes on overlay click / Esc / ✕,
 * and portals above everything.
 *
 * API: a large panel (`w-[min(680px,92vw)]`), an object header slot, and a
 * tabbed body (`tabs={[{ key, label, content }]}`). Tab state is internal (or
 * controlled via `activeTab`/`onTabChange`). Panels are always mounted-lazy:
 * only the active tab's content renders, so heavy tabs don't pay cost until
 * viewed.
 *
 * This is the primitive the Item reference adopts; the old quick-views stay in
 * place this phase (not deleted).
 */

export interface DrawerTab {
  key: string;
  label: React.ReactNode;
  content: React.ReactNode;
}

interface ContextDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Header region (title, status, actions). Sits above the tab bar. */
  header?: React.ReactNode;
  tabs: ReadonlyArray<DrawerTab>;
  /** Controlled active tab key (optional). */
  activeTab?: string;
  onTabChange?: (key: string) => void;
  /** Accessible title (visually hidden if `header` carries the visible title). */
  title?: string;
  /** Optional trigger element (rendered as-is via Radix asChild). */
  trigger?: React.ReactNode;
  className?: string;
}

export function ContextDrawer({
  open,
  onOpenChange,
  header,
  tabs,
  activeTab,
  onTabChange,
  title = "Details",
  trigger,
  className,
}: ContextDrawerProps) {
  const firstKey = tabs[0]?.key ?? "";
  const [internalTab, setInternalTab] = React.useState(firstKey);
  const current = activeTab ?? internalTab;

  // Keep internal state valid if the tab set changes.
  React.useEffect(() => {
    if (!tabs.some((t) => t.key === current) && firstKey) {
      setInternalTab(firstKey);
    }
  }, [tabs, current, firstKey]);

  function selectTab(key: string) {
    if (onTabChange) onTabChange(key);
    else setInternalTab(key);
  }

  const activePanel = tabs.find((t) => t.key === current) ?? tabs[0];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay
          className="erp-drawer-overlay fixed inset-0 z-[95]"
          style={{ background: "rgba(15,23,42,0.40)", backdropFilter: "blur(2px)" }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "erp-drawer-content fixed right-0 top-0 z-[100] flex h-dvh w-[min(680px,92vw)] flex-col border-l border-hairline-strong bg-surface-card",
            className,
          )}
          style={{ boxShadow: "-24px 0 60px -20px rgba(15,23,42,0.35)" }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-hairline px-6 pt-6 pb-4">
            <div className="min-w-0 flex-1">
              {header ?? <Dialog.Title className="text-[18px] font-bold text-ink-strong">{title}</Dialog.Title>}
              {header && <Dialog.Title className="sr-only">{title}</Dialog.Title>}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="shrink-0 rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
            >
              <X size={18} strokeWidth={2.4} />
            </Dialog.Close>
          </div>

          {/* Tab bar */}
          {tabs.length > 1 && (
            <div
              role="tablist"
              aria-label={title}
              className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-hairline px-4"
            >
              {tabs.map((t) => {
                const isActive = t.key === current;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => selectTab(t.key)}
                    className={cn(
                      "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-semibold transition-colors",
                      isActive
                        ? "border-brand text-brand"
                        : "border-transparent text-ink-subtle hover:text-ink-strong",
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Body - lazy: only the active panel is rendered. */}
          <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {activePanel?.content}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
