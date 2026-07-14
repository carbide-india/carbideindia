"use client";
import { usePathname } from "next/navigation";
import { MainNavPill } from "./main-nav-pill";
import { FormsLauncher } from "./forms-launcher";
import { moduleForPath, getModule } from "./modules";

interface Props {
  activeTasks: number;
  isAdmin: boolean;
  variant?: "drawer";
}

/**
 * Module-scoped primary navigation. The visible pills are ONLY the items of
 * the module the current route belongs to (see {@link modules}) - so WMS shows
 * work-management surfaces, Enquiries shows the sales pipeline + Forms, and
 * Masters shows the master registries. Switching modules happens via the Hub
 * launchpad (the logo returns there).
 */
export function MainNav({ activeTasks, isAdmin, variant }: Props) {
  const pathname = usePathname();
  const mod = getModule(moduleForPath(pathname));

  function isActive(href: string, exact?: boolean): boolean {
    if (exact || href === "/") return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  const items = mod.items.filter((it) => !it.adminOnly || isAdmin);

  return (
    <nav
      aria-label="Primary"
      className={
        variant === "drawer"
          ? "flex flex-col gap-1.5 w-full"
          : "flex items-center gap-1 2xl:gap-1.5 max-md:gap-1"
      }
    >
      {items.map((it, i) => (
        <span key={it.href} className="contents">
          <MainNavPill
            href={it.href}
            label={it.label}
            Icon={it.Icon}
            active={isActive(it.href, it.exact)}
            count={it.taskCount ? activeTasks : undefined}
            variant={variant}
          />
          {/* Forms launcher sits right after the module's home item (Enquiries). */}
          {mod.hasForms && i === 0 && <FormsLauncher variant={variant} />}
        </span>
      ))}
    </nav>
  );
}
