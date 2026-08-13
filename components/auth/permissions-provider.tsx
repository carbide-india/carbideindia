"use client";

import * as React from "react";

/**
 * The signed-in employee's effective permission keys, provided once at the app
 * layout so any client component can render permission-aware chrome without
 * prop-drilling through ~30 shell call sites.
 *
 * `null` means enforcement is OFF (the app's state until an admin switches it on
 * in Admin → Access Control) and is deliberately distinct from `[]` ("holds
 * nothing"): treating them the same would hide the entire pipeline from
 * everyone the moment the flag flipped.
 *
 * This is for RENDERING ONLY. Hiding a link is convenience, never security —
 * every page and server action does its own gating.
 */
const PermissionsContext = React.createContext<string[] | null>(null);

export function PermissionsProvider({
  value,
  children,
}: {
  value: string[] | null;
  children: React.ReactNode;
}) {
  return (
    <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
  );
}

/** Permission keys the viewer holds, or null while enforcement is off. */
export function useAllowedPermissions(): string[] | null {
  return React.useContext(PermissionsContext);
}
