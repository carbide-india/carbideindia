import { AlertTriangle, BellRing, FileCode2, PenLine, PowerOff } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { getTemplateOverview } from "@/lib/queries/templates";
import { AdminKpiTile } from "@/components/admin/admin-kpi-tile";
import { TemplatesWorkbench } from "@/components/admin/templates-workbench";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const me = await requireAdmin();
  const { slots, totals } = await getTemplateOverview();

  // Surfaced in the confirm dialog so an admin in a Resend-less environment
  // is told BEFORE they press send, not after nothing arrives.
  const emailConfigured = Boolean(process.env.RESEND_API_KEY);

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-8">
        <span
          className="block text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#a2a8b4]"
          style={{ fontFamily: "var(--font-mono-display)" }}
        >
          Admin · Communication
        </span>
        <h1 className="mt-1.5 text-[30px] font-extrabold leading-tight tracking-tight text-[#1e2f66]">
          Message Templates
        </h1>
        <p className="mt-2 max-w-3xl text-[14px] text-[#6b7280] tabular-nums">
          {totals.slots} slots · {totals.active} custom &amp; live ·{" "}
          {totals.disabled} switched off · {totals.builtin} on the built-in
          fallback
          {totals.invalid > 0 ? ` · ${totals.invalid} need fixing` : ""}
        </p>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-[#6b7280]">
          One editable subject and body per notification event, per channel.
          Anything not stored and switched on here falls back to the branded
          react-email component or push payload that ships in the codebase, so
          a template can always be turned off safely.
        </p>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminKpiTile
          index={0}
          label="Custom & live"
          value={totals.active}
          hint="Stored wording in use"
          tone="green"
          icon={<PenLine size={16} strokeWidth={2.2} />}
        />
        <AdminKpiTile
          index={1}
          label="Switched off"
          value={totals.disabled}
          hint="Kept, but not in use"
          tone="amber"
          icon={<PowerOff size={16} strokeWidth={2.2} />}
        />
        <AdminKpiTile
          index={2}
          label="Built-in"
          value={totals.builtin}
          hint="No stored version yet"
          tone="blue"
          icon={<FileCode2 size={16} strokeWidth={2.2} />}
        />
        <AdminKpiTile
          index={3}
          label="Events covered"
          value={totals.slots}
          hint="Kinds × channels"
          tone="purple"
          icon={<BellRing size={16} strokeWidth={2.2} />}
        />
      </div>

      {totals.invalid > 0 && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-2.5 rounded-section border px-4 py-3 text-[13px] leading-relaxed"
          style={{
            borderColor: "color-mix(in srgb, var(--color-red) 30%, transparent)",
            background: "var(--color-red-bg)",
            color: "var(--color-red-deep)",
          }}
        >
          <AlertTriangle aria-hidden size={16} className="mt-[1px] shrink-0" />
          <span>
            {totals.invalid} stored template
            {totals.invalid > 1 ? "s reference" : " references"} a placeholder
            that is no longer valid and{" "}
            {totals.invalid > 1 ? "are" : "is"} being ignored in favour of the
            built-in message. They are flagged in the list below.
          </span>
        </div>
      )}

      <TemplatesWorkbench
        slots={slots}
        adminEmail={me.email}
        emailConfigured={emailConfigured}
      />
    </div>
  );
}
