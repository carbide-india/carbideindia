"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { nextModuleFor, prevModuleFor } from "@/lib/modules/pipeline";
import { useAllowedPermissions } from "@/components/auth/permissions-provider";
import { cn } from "@/lib/utils";

/**
 * "Previous / next module" — the bottom of every module sidebar.
 *
 * Lets someone walk the pipeline in one flow (KYC → Sample → Enquiry → Primary
 * → Secondary → Costing → Quotation → Negotiation → Sales Order), forwards or
 * back, instead of bouncing off to the Hub and re-entering.
 *
 * Both steps skip modules the viewer may not enter, so the destination is
 * always somewhere they can actually go. `allowedPermissions` is null while
 * permission enforcement is off (the app's default until an admin switches it
 * on in Admin → Access Control), which means everyone sees the whole pipeline —
 * exactly today's behaviour.
 *
 * NOTE: hiding a button is convenience, never security. The destination pages
 * do their own gating; this only keeps the sidebar honest.
 */
export function ModuleStepButtons({ collapsed }: { collapsed?: boolean }) {
  const pathname = usePathname();
  // From context (provided once in the app layout) rather than props — the
  // enquiry shell alone has ~30 call sites that would otherwise all need it.
  const allowedPermissions = useAllowedPermissions();
  const allowed = allowedPermissions ? new Set(allowedPermissions) : null;
  const prev = prevModuleFor(pathname, allowed);
  const next = nextModuleFor(pathname, allowed);

  if (!prev && !next) return null;

  // Collapsed rail: two icon-only squares side by side — there is no room for
  // the stacked "PREVIOUS MODULE / <label>" wording in 72px.
  if (collapsed) {
    return (
      <div className="flex items-center justify-center gap-1.5">
        {prev && (
          <Link
            href={prev.href as Route}
            title={`Previous: ${prev.label}`}
            className="grid h-[38px] w-[38px] place-items-center rounded-lg border border-[#c7cae6] bg-white text-[#5b6076] transition-colors hover:border-[#3f3f94] hover:text-[#3f3f94]"
          >
            <ArrowLeft className="h-[17px] w-[17px]" strokeWidth={2.6} />
          </Link>
        )}
        {next && (
          <Link
            href={next.href as Route}
            title={`Next: ${next.label}`}
            className="grid h-[38px] w-[38px] place-items-center rounded-lg border-[1.5px] border-[#3f3f94] bg-[#eef0fb] text-[#3f3f94] transition-colors hover:bg-[#3f3f94] hover:text-white"
          >
            <ArrowRight className="h-[17px] w-[17px]" strokeWidth={2.6} />
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {prev && (
        // Quieter than "next": going back is a correction, going forward is the
        // flow. Same footprint so the pair reads as one control.
        <Link
          href={prev.href as Route}
          className="group flex h-[46px] items-center gap-2 rounded-lg border border-[#c7cae6] bg-white px-3 text-[13px] font-bold text-[#5b6076] transition-all hover:border-[#3f3f94] hover:text-[#3f3f94]"
        >
          <ArrowLeft
            className="h-[17px] w-[17px] shrink-0 transition-transform group-hover:-translate-x-0.5"
            strokeWidth={2.6}
          />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] opacity-60">
              Previous module
            </span>
            <span className="truncate">{prev.label}</span>
          </span>
        </Link>
      )}
      {next && (
        <Link
          href={next.href as Route}
          // Tinted rather than white: this is the pipeline's forward action and
          // has to be findable at a glance in a long sidebar.
          className="group flex h-[46px] items-center gap-2 rounded-lg border-[1.5px] border-[#3f3f94] bg-[#eef0fb] px-3 text-[13px] font-bold text-[#3f3f94] transition-all hover:bg-[#3f3f94] hover:text-white"
        >
          <ArrowRight
            className="h-[17px] w-[17px] shrink-0 transition-transform group-hover:translate-x-0.5"
            strokeWidth={2.6}
          />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] opacity-70">
              Next module
            </span>
            <span className="truncate">{next.label}</span>
          </span>
        </Link>
      )}
    </div>
  );
}

/** @deprecated Use `ModuleStepButtons` — it renders both directions. */
export const NextModuleButton = ModuleStepButtons;
