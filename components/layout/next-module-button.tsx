"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { nextModuleFor } from "@/lib/modules/pipeline";
import { useAllowedPermissions } from "@/components/auth/permissions-provider";
import { cn } from "@/lib/utils";

/**
 * "Go to next module" — the bottom of every module sidebar.
 *
 * Lets someone walk the pipeline in one flow (KYC → Sample → Enquiry → Primary
 * → Secondary → Costing → Quotation → Negotiation → Sales Order) instead of
 * bouncing back to the Hub and re-entering.
 *
 * It skips modules the viewer may not enter, so the "next" step is always
 * somewhere they can actually go. `allowedPermissions` is null while permission
 * enforcement is off (the app's default until an admin switches it on in
 * Admin → Access Control), which means everyone sees the whole pipeline —
 * exactly today's behaviour.
 *
 * NOTE: hiding a button is convenience, never security. The destination pages
 * do their own gating; this only keeps the sidebar honest.
 */
export function NextModuleButton({ collapsed }: { collapsed?: boolean }) {
  const pathname = usePathname();
  // From context (provided once in the app layout) rather than props — the
  // enquiry shell alone has ~30 call sites that would otherwise all need it.
  const allowedPermissions = useAllowedPermissions();
  const allowed = allowedPermissions ? new Set(allowedPermissions) : null;
  const next = nextModuleFor(pathname, allowed);

  // End of the pipeline, or nothing further this person may enter.
  if (!next) return null;

  return (
    <Link
      href={next.href as Route}
      title={collapsed ? `Next: ${next.label}` : undefined}
      className={cn(
        // Tinted rather than white: this is the pipeline's forward action and
        // has to be findable at a glance in a long sidebar.
        "group flex h-[46px] items-center rounded-lg border-[1.5px] border-[#3f3f94] bg-[#eef0fb] text-[13px] font-bold text-[#3f3f94] transition-all hover:bg-[#3f3f94] hover:text-white",
        collapsed ? "justify-center px-0" : "gap-2 px-3",
      )}
    >
      <ArrowRight
        className="h-[17px] w-[17px] shrink-0 transition-transform group-hover:translate-x-0.5"
        strokeWidth={2.6}
      />
      {!collapsed && (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] opacity-70">
            Next module
          </span>
          <span className="truncate">{next.label}</span>
        </span>
      )}
    </Link>
  );
}
