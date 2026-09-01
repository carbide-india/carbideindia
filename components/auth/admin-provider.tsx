"use client";

import * as React from "react";

/**
 * The signed-in employee's admin flag, provided once at the app layout so any
 * client component can render admin-only chrome (e.g. the "+ Add option"
 * controls) without prop-drilling. RENDERING ONLY — the authority is the
 * `requireAdmin()` guard in each server action; hiding a button is convenience.
 */
const AdminContext = React.createContext<boolean>(false);

export function AdminProvider({
  isAdmin,
  children,
}: {
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  return <AdminContext.Provider value={isAdmin}>{children}</AdminContext.Provider>;
}

/** True when the viewer is an admin. */
export function useIsAdmin(): boolean {
  return React.useContext(AdminContext);
}
