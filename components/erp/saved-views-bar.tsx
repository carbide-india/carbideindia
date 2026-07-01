"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Star, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fireToast } from "@/lib/toast";
import type { SavedView } from "@/db/schema";
import {
  createSavedView,
  renameSavedView,
  deleteSavedView,
} from "@/app/(app)/_actions/saved-views";

/**
 * SavedViewsBar (ERP redesign — Phase 3).
 *
 * A bar listing a register module's saved views (from `lib/views/saved-views.ts`
 * + `_actions/saved-views.ts`): apply / create-from-current / rename / delete.
 * Presentational + wired to those Phase-1 actions.
 *
 * This phase it's mounted as a minimal, non-disruptive demo on the Item register
 * toolbar. Full register integration (nuqs-encoded configs, pinned filters)
 * lands in Phase 9 — hence `getCurrentConfig`/`onApply` are optional hooks the
 * host wires later; without them the bar still lists, creates, renames, deletes.
 */

interface SavedViewsBarProps {
  module: string;
  views: ReadonlyArray<SavedView>;
  /** The active view id (highlighted). */
  activeId?: string | null;
  /** Snapshot the current register state to persist in a new view. */
  getCurrentConfig?: () => unknown;
  /** Apply a view's config to the register. */
  onApply?: (view: SavedView) => void;
  className?: string;
}

export function SavedViewsBar({
  module,
  views,
  activeId,
  getCurrentConfig,
  onApply,
  className,
}: SavedViewsBarProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [draftName, setDraftName] = React.useState("");

  function handleApply(view: SavedView) {
    onApply?.(view);
  }

  function handleCreate() {
    const name = window.prompt("Name this view");
    if (!name?.trim()) return;
    startTransition(async () => {
      const res = await createSavedView({
        module,
        name: name.trim(),
        config: getCurrentConfig?.() ?? {},
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `View "${name.trim()}" saved.` });
      router.refresh();
    });
  }

  function startRename(view: SavedView) {
    setRenamingId(view.id);
    setDraftName(view.name);
  }

  function commitRename(id: string) {
    const name = draftName.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    startTransition(async () => {
      const res = await renameSavedView(id, name);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setRenamingId(null);
      router.refresh();
    });
  }

  function handleDelete(view: SavedView) {
    if (!window.confirm(`Delete view "${view.name}"?`)) return;
    startTransition(async () => {
      const res = await deleteSavedView(view.id);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `View "${view.name}" deleted.` });
      router.refresh();
    });
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
        <Star size={12} strokeWidth={2.4} />
        Views
      </span>

      {views.length === 0 && (
        <span className="text-[13px] text-ink-subtle">No saved views yet.</span>
      )}

      {views.map((view) => {
        const isActive = view.id === activeId;
        const isRenaming = view.id === renamingId;

        if (isRenaming) {
          return (
            <span
              key={view.id}
              className="inline-flex items-center gap-1 rounded-full border border-brand bg-surface-card px-2 py-1"
            >
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(view.id);
                  if (e.key === "Escape") setRenamingId(null);
                }}
                className="w-28 bg-transparent text-[13px] font-medium text-ink-strong focus:outline-none"
              />
              <button
                type="button"
                onClick={() => commitRename(view.id)}
                aria-label="Save name"
                className="text-brand hover:text-brand-deep"
              >
                <Check size={14} strokeWidth={2.6} />
              </button>
              <button
                type="button"
                onClick={() => setRenamingId(null)}
                aria-label="Cancel rename"
                className="text-ink-subtle hover:text-ink-strong"
              >
                <X size={14} strokeWidth={2.4} />
              </button>
            </span>
          );
        }

        return (
          <span
            key={view.id}
            className={cn(
              "group inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] font-semibold transition-colors",
              isActive
                ? "border-brand bg-[var(--vp-cyan-tint)] text-brand-deep"
                : "border-hairline bg-surface-card text-ink-soft hover:border-hairline-strong",
            )}
          >
            <button
              type="button"
              onClick={() => handleApply(view)}
              className="max-w-[160px] truncate"
              disabled={pending}
              title={view.isShared ? `${view.name} (shared)` : view.name}
            >
              {view.name}
            </button>
            <button
              type="button"
              onClick={() => startRename(view)}
              aria-label={`Rename ${view.name}`}
              className="hidden text-ink-subtle hover:text-brand group-hover:inline-flex"
            >
              <Pencil size={12} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(view)}
              aria-label={`Delete ${view.name}`}
              className="hidden text-ink-subtle hover:text-red group-hover:inline-flex"
            >
              <Trash2 size={12} strokeWidth={2.4} />
            </button>
          </span>
        );
      })}

      <button
        type="button"
        onClick={handleCreate}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-hairline-strong px-2.5 py-1 text-[13px] font-semibold text-ink-subtle transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
      >
        <Plus size={13} strokeWidth={2.4} />
        New view
      </button>
    </div>
  );
}
