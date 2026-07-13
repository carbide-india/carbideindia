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
}: {
  kind: FormDraftKind;
  enabled: boolean;
  resumeDraftId?: string;
  watch: UseFormWatch<T>;
  getValues: UseFormGetValues<T>;
}) {
  const [draftId] = React.useState(() =>
    resumeDraftId ?? (enabled ? crypto.randomUUID() : ""),
  );
  const discardedRef = React.useRef(false);

  const save = React.useCallback(async () => {
    if (!enabled || !draftId || discardedRef.current) return;
    try {
      await saveFormDraft({
        kind,
        id: draftId,
        payload: getValues() as Record<string, unknown>,
      });
    } catch {
      /* ignore transient auto-save errors */
    }
  }, [enabled, draftId, kind, getValues]);

  React.useEffect(() => {
    if (!enabled || !draftId) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const sub = watch(() => {
      if (t) clearTimeout(t);
      t = setTimeout(() => void save(), 900);
    });
    return () => {
      if (t) clearTimeout(t);
      sub.unsubscribe();
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
