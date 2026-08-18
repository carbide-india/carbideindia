"use client";

import * as React from "react";

/**
 * The page title, hoisted out of the content area into the module header.
 *
 * Registers used to print their name inside the toolbar row ("Primary
 * Feasibility  24 enquirys  [search] [filters]"), which pushed Columns/Export
 * onto a second line and repeated a name the header already had room for. Now
 * the page publishes its title through this context and the shell header
 * renders it beside the brand, level with where the sidebar ends.
 *
 * Publishing (rather than each page passing a `title` prop down to the shell)
 * means the register itself owns the wording — "Customer PO Register" stays
 * "Customer PO Register" — without touching a single page component.
 *
 * Safe outside a provider: `useSetModuleTitle` no-ops, so a register rendered
 * on a bare page (or in a test) behaves exactly as before.
 */

interface ModuleTitleStore {
  title: string | null;
  setTitle: (title: string | null) => void;
}

const ModuleTitleContext = React.createContext<ModuleTitleStore | null>(null);

export function ModuleTitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = React.useState<string | null>(null);
  const value = React.useMemo(() => ({ title, setTitle }), [title]);
  return (
    <ModuleTitleContext.Provider value={value}>
      {children}
    </ModuleTitleContext.Provider>
  );
}

/**
 * Publish `title` into the header for as long as this component is mounted.
 * Clears on unmount so navigating away never leaves a stale name up top.
 */
export function useSetModuleTitle(title: string | null | undefined): void {
  const store = React.useContext(ModuleTitleContext);
  const setTitle = store?.setTitle;
  React.useEffect(() => {
    if (!setTitle) return;
    setTitle(title ?? null);
    return () => setTitle(null);
  }, [setTitle, title]);
}

/**
 * Header slot. Renders the published title, falling back to the route-derived
 * module name so pages that aren't registers (forms, dashboards) still read
 * correctly.
 */
export function ModuleTitleSlot({ fallback }: { fallback?: string | null }) {
  const store = React.useContext(ModuleTitleContext);
  const text = store?.title ?? fallback ?? null;
  if (!text) return null;
  return (
    <h1 className="truncate text-[19px] font-black leading-none tracking-tight text-[#3f3f94]">
      {text}
    </h1>
  );
}
