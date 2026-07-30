"use client";

import * as React from "react";
import type { FieldValues, UseFormWatch, UseFormGetValues } from "react-hook-form";
import { saveFormDraft, deleteFormDraft } from "@/app/(app)/_actions/form-drafts";
import type { FormDraftKind } from "@/lib/drafts/form-drafts";

/**
 * Auto-save a form as a draft while the user types (debounced ~0.9s). Returns
 * the stable draft id and a `discard()` to call on final submit so the draft
 * doesn't linger. Owner-guarded + empty-skipped server-side.
 */
export function useFormDraft<T extends FieldValues>({
  kind,
  enabled,
  resumeDraftId,
  watch,
  getValues,
  extra,
}: {
  kind: FormDraftKind;
  enabled: boolean;
  resumeDraftId?: string;
  watch: UseFormWatch<T>;
  getValues: UseFormGetValues<T>;
  /**
   * Extra payload merged into the saved draft, for state that lives OUTSIDE
   * react-hook-form (e.g. uploaded photo URLs held in local state). Without
   * this, that state is silently dropped from the draft and lost on resume.
   * Kept in a ref so an inline arrow doesn't re-subscribe the watcher.
   */
  extra?: () => Record<string, unknown>;
}) {
  const [draftId] = React.useState(() =>
    resumeDraftId ?? (enabled ? crypto.randomUUID() : ""),
  );
  const discardedRef = React.useRef(false);
  const extraRef = React.useRef(extra);
  React.useEffect(() => {
    extraRef.current = extra;
  });

  const save = React.useCallback(async () => {
    if (!enabled || !draftId || discardedRef.current) return;
    try {
      await saveFormDraft({
        kind,
        id: draftId,
        payload: {
          ...(getValues() as Record<string, unknown>),
          ...(extraRef.current ? extraRef.current() : {}),
        },
      });
    } catch {
      /* ignore transient auto-save errors */
    }
  }, [enabled, draftId, kind, getValues]);

  React.useEffect(() => {
    if (!enabled || !draftId) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    let dirty = false; // edits made but not yet flushed by the debounce timer
    const sub = watch(() => {
      dirty = true;
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        dirty = false;
        void save();
      }, 900);
    });
    return () => {
      if (t) clearTimeout(t);
      sub.unsubscribe();
      // Flush the last edits typed within the debounce window before leaving,
      // so navigating away right after typing doesn't drop them.
      if (dirty) void save();
    };
  }, [enabled, draftId, watch, save]);

  const discard = React.useCallback(async () => {
    discardedRef.current = true;
    if (draftId) {
      try {
        await deleteFormDraft(kind, draftId);
      } catch {
        /* ignore */
      }
    }
  }, [kind, draftId]);

  return { draftId, discard };
}
