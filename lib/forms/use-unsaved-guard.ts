"use client";

import * as React from "react";

/**
 * Warns the user before they lose unsaved edits by refreshing, closing the tab,
 * or navigating to an external URL. Matters most for EDIT mode, where there is
 * no draft autosave safety net (drafts are create-mode only) - without this,
 * editing an existing client/enquiry and hitting refresh silently discards
 * everything. Pass `active` = form is dirty and not currently submitting.
 *
 * Note: the browser `beforeunload` prompt covers refresh / close / hard nav; it
 * does not intercept in-app <Link> client navigation (App Router has no stable
 * blocker yet) - that's a known limitation, not a gap in this hook.
 */
export function useUnsavedGuard(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy requirement for the native prompt to show in some browsers.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}
