"use client";

import { usePathname } from "next/navigation";
import { moduleForPath, getModule } from "./modules";
import { ModuleTitleBadge } from "./module-title-badge";

/**
 * The current module's title badge for the main (WMS) header. Derives the
 * active module from the pathname so the badge reads "WMS", "Masters", etc.
 * Rendered just after the header search, before the right-side action icons -
 * matching the module-shell headers where the title sits right of the search.
 */
export function HeaderModuleTitle() {
  const pathname = usePathname();
  const mod = getModule(moduleForPath(pathname));
  return <ModuleTitleBadge title={mod.label} align="start" />;
}
