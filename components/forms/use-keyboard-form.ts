"use client";

import * as React from "react";
import { focusNextFrom } from "@/lib/focus-next";

/**
 * Keyboard-first form ergonomics (Enter = next field, hybrid).
 *
 * - Enter in a single-line <input>  -> preventDefault + advance focus to the
 *   next focusable field (native DOM order, via focusNextFrom).
 * - Enter in a <textarea>           -> untouched (newline).
 * - Enter on a <button>             -> untouched (its own action).
 * - Ctrl/Cmd + Enter anywhere       -> submit the form.
 *
 * Guard: if the event was already handled (e.defaultPrevented) we do nothing,
 * so TagsInput (Enter adds a tag) and cmdk comboboxes (Enter selects the
 * highlighted option) keep working. Targets inside a [cmdk-root] or carrying
 * role="combobox" are likewise skipped.
 *
 * We never touch Tab order and never block in-app navigation.
 */

function isInsideCombobox(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.closest("[cmdk-root]")) return true;
  if (el.closest('[role="combobox"]')) return true;
  return false;
}

export function useKeyboardForm(opts?: { onSubmit?: () => void }) {
  const onSubmit = opts?.onSubmit;

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== "Enter") return;

      // An Enter a nested widget already handled (called preventDefault on) must
      // NOT also drive the form - checked FIRST, before the Ctrl/Cmd + Enter
      // submit, so an inline +Add modal / TagsInput / cmdk that lives inside the
      // form can't leak its Ctrl/Cmd + Enter out and submit the whole form.
      if (e.defaultPrevented) return;

      // Ctrl/Cmd + Enter -> submit, from anywhere in the form.
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        if (onSubmit) {
          onSubmit();
        } else {
          const form = (e.target as HTMLElement | null)?.closest("form");
          form?.requestSubmit();
        }
        return;
      }

      // Modified Enter (Shift/Alt): leave it be.
      if (e.shiftKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Let comboboxes/cmdk own their Enter (select highlighted option).
      if (isInsideCombobox(target)) return;

      const tag = target.tagName;

      // Textareas keep their newline; buttons keep their own action.
      if (tag === "TEXTAREA" || tag === "BUTTON") return;

      // Plain single-line input: advance to the next field instead of
      // submitting the form.
      if (tag === "INPUT") {
        const type = (target as HTMLInputElement).type;
        // Buttons rendered as <input> (submit/button/reset) keep their action.
        if (type === "submit" || type === "button" || type === "reset") return;
        e.preventDefault();
        focusNextFrom(target, 1);
      }
    },
    [onSubmit],
  );

  return {
    /** Spread on a native <form>. */
    formProps: { onKeyDown: handleKeyDown },
    /** Spread on a workspace root container that has no <form>. */
    containerProps: { onKeyDown: handleKeyDown },
  };
}

/**
 * On first mount, focus the first genuine input/select/textarea (never a
 * button) inside `ref`, without scrolling the page. Runs exactly once.
 */
export function useAutofocusFirstField(
  ref: React.RefObject<HTMLElement | null>,
) {
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const first = root.querySelector<HTMLElement>(
      "input:not([disabled]):not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]), select:not([disabled]), textarea:not([disabled])",
    );
    first?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
