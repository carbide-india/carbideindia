"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Download,
  Eye,
  Factory,
  Loader2,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import {
  SALES_ORDER_STAGE_BUCKETS,
  SALES_ORDER_STATUS_LABELS,
  SALES_ORDER_STATUS_COLORS,
  type SalesOrderStatus,
} from "@/db/enums";
import {
  setSalesOrderStatus,
  setSalesOrderCopySent,
  updateProductionNotes,
  updateLineProductionNotes,
} from "@/app/(app)/sales-orders/actions";
import type { SalesOrderLineNote } from "@/lib/queries/sales-orders";
import { Chip } from "@/components/inquiries/chip";
import { SectionCard, Segmented } from "@/components/inquiries/form-field";
import { fireToast } from "@/lib/toast";

/**
 * "One Sales Order, TWO outputs" - the panel that makes the dual copy real on
 * the detail page.
 *
 * Left: the CUSTOMER copy (what already goes out today) - its stored document
 * link, its own Sent toggle, and view/print/download of the generated copy.
 * Right: the FACTORY / production copy - its OWN Sent toggle (independent of
 * the customer's), the header production narrative, and view/download of the
 * internal sheet. Below both: the per-line production notes that print on the
 * factory copy only.
 *
 * Everything internal is marked amber, never brand red - red is this app's
 * error role.
 *
 * *** The exact extra production FIELDS are still to be collected from Alok. ***
 * Nothing here invents one: the factory copy prints only fields that already
 * exist on the item / line / enquiry spine, plus these free-text notes.
 */

interface Props {
  salesOrderId: string;
  soNo: string;
  status: SalesOrderStatus;
  customerSoSent: boolean;
  customerSoLink: string | null;
  productionSoSent: boolean;
  productionSoLink: string | null;
  productionNotes: string | null;
  lines: SalesOrderLineNote[];
}

const SENT_OPTIONS = [
  { value: "yes" as const, label: "Sent" },
  { value: "no" as const, label: "Not sent" },
];

export function SoOutputsCard({
  salesOrderId,
  soNo,
  status,
  customerSoSent,
  customerSoLink,
  productionSoSent,
  productionSoLink,
  productionNotes,
  lines,
}: Props) {
  const router = useRouter();
  const [statusPending, startStatusTransition] = React.useTransition();

  function onStatusChange(next: string | undefined) {
    if (!next || next === status) return;
    startStatusTransition(async () => {
      const res = await setSalesOrderStatus(salesOrderId, next);
      if (res.ok) {
        fireToast({
          message: `Moved to ${SALES_ORDER_STATUS_LABELS[next as SalesOrderStatus]}.`,
        });
        router.refresh();
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Stage bucket ─────────────────────────────────────────────── */}
      <SectionCard
        title="Sales Order Stage"
        hint="The house buckets. Every sales order sits in exactly one — the register counts them live."
      >
        <div className="flex flex-wrap items-center gap-3">
          <div
            className={
              statusPending ? "pointer-events-none opacity-60" : undefined
            }
          >
            <Segmented
              options={SALES_ORDER_STAGE_BUCKETS.map((b) => ({
                value: b,
                label: SALES_ORDER_STATUS_LABELS[b],
              }))}
              value={status}
              onChange={onStatusChange}
              allowClear={false}
              ariaLabel="Sales order stage"
            />
          </div>
          <Chip
            label={SALES_ORDER_STATUS_LABELS[status]}
            tone={SALES_ORDER_STATUS_COLORS[status]}
          />
        </div>
      </SectionCard>

      {/* ── The two outputs ──────────────────────────────────────────── */}
      <SectionCard
        title="Sales Order Outputs"
        hint="One order, two copies. The customer copy carries what the customer needs; the factory copy adds the internal production detail. Their sent flags are independent."
      >
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <CopyPanel
            salesOrderId={salesOrderId}
            soNo={soNo}
            copy="customer"
            title="Customer Copy"
            Icon={UserRound}
            blurb="Order header, customer PO, commercial terms and the customer-facing product spec."
            sent={customerSoSent}
            storedLink={customerSoLink}
            storedLinkLabel="Customer SO link"
          />
          <CopyPanel
            salesOrderId={salesOrderId}
            soNo={soNo}
            copy="factory"
            title="Factory Copy"
            Icon={Factory}
            blurb="Everything on the customer copy plus item code, internal grade, internal production code, production part no and production notes."
            sent={productionSoSent}
            storedLink={productionSoLink}
            storedLinkLabel="Production SO link"
            internal
          />
        </div>
      </SectionCard>

      {/* ── Factory narrative ────────────────────────────────────────── */}
      <ProductionNotesCard
        salesOrderId={salesOrderId}
        productionNotes={productionNotes}
        lines={lines}
      />
    </div>
  );
}

// ── One copy ──────────────────────────────────────────────────────────────

function CopyPanel({
  salesOrderId,
  soNo,
  copy,
  title,
  Icon,
  blurb,
  sent,
  storedLink,
  storedLinkLabel,
  internal,
}: {
  salesOrderId: string;
  soNo: string;
  copy: "customer" | "factory";
  title: string;
  Icon: typeof UserRound;
  blurb: string;
  sent: boolean;
  storedLink: string | null;
  storedLinkLabel: string;
  internal?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const slug = copy === "factory" ? "factory-copy" : "customer-copy";
  const accent = internal ? "var(--color-amber-deep)" : "var(--color-brand)";

  function onToggle(v: string | undefined) {
    if (!v) return;
    const next = v === "yes";
    if (next === sent) return;
    startTransition(async () => {
      const res = await setSalesOrderCopySent(salesOrderId, copy, next);
      if (res.ok) {
        fireToast({
          message: next
            ? `${title} marked sent.`
            : `${title} marked not sent.`,
        });
        router.refresh();
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  return (
    <div
      className="flex flex-col gap-3.5 rounded-xl border px-4 py-4"
      style={{
        borderColor: internal
          ? "color-mix(in srgb, var(--color-amber) 38%, transparent)"
          : "var(--color-hairline)",
        background: internal
          ? "color-mix(in srgb, var(--color-amber) 5%, transparent)"
          : "var(--color-surface-soft)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon size={16} strokeWidth={2.4} style={{ color: accent }} />
          <span className="text-[14px] font-bold text-ink-strong">{title}</span>
        </div>
        <Chip label={sent ? "Sent" : "Not sent"} tone={sent ? "green" : "slate"} />
      </div>

      {internal && (
        <p
          className="flex items-start gap-1.5 text-[11.5px] font-bold"
          style={{ color: "var(--color-amber-deep)" }}
        >
          <ShieldAlert size={13} strokeWidth={2.4} style={{ marginTop: 1 }} />
          Internal — not for the customer.
        </p>
      )}

      <p className="text-[12.5px] leading-snug text-ink-muted">{blurb}</p>

      <div className={pending ? "pointer-events-none opacity-60" : undefined}>
        <Segmented
          options={SENT_OPTIONS}
          value={sent ? "yes" : "no"}
          onChange={onToggle}
          allowClear={false}
          ariaLabel={`${title} sent`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
        <Link
          href={`/sales-orders/${salesOrderId}/${slug}` as Route}
          className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-3.5 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:border-hairline-strong"
        >
          <Eye size={13} strokeWidth={2.4} />
          View
        </Link>
        <a
          href={`/sales-orders/${salesOrderId}/${slug}.pdf`}
          className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-3.5 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:border-hairline-strong"
          title={`Download the ${title.toLowerCase()} of ${soNo}`}
        >
          <Download size={13} strokeWidth={2.4} />
          PDF
        </a>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-ink-subtle">
          {storedLinkLabel}
        </span>
        {storedLink ? (
          <a
            href={storedLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 break-all text-[12.5px] font-semibold text-brand hover:underline"
          >
            Open stored document
            <ArrowUpRight size={12} strokeWidth={2.4} />
          </a>
        ) : (
          <span className="text-[12.5px] font-semibold text-ink-subtle">
            Not recorded
          </span>
        )}
      </div>
    </div>
  );
}

// ── Factory narrative (header + per line) ─────────────────────────────────

function ProductionNotesCard({
  salesOrderId,
  productionNotes,
  lines,
}: {
  salesOrderId: string;
  productionNotes: string | null;
  lines: SalesOrderLineNote[];
}) {
  return (
    <SectionCard
      title="Production Instructions (Factory Copy Only)"
      hint="Free text that prints on the factory copy and never on the customer copy."
    >
      <div className="flex flex-col gap-5">
        <NoteEditor
          label="Order-level production notes"
          initial={productionNotes}
          placeholder="e.g. release in two batches, first batch by month end"
          onSave={(value) => updateProductionNotes(salesOrderId, value)}
        />

        <div className="flex flex-col gap-3 border-t border-hairline pt-4">
          <p className="text-[12px] font-black uppercase tracking-[0.12em] text-ink-subtle">
            Per-product production notes
          </p>
          {lines.length === 0 ? (
            <p className="rounded-xl border border-dashed border-hairline-strong px-4 py-5 text-center text-[13px] font-semibold text-ink-subtle">
              No products on this sales order yet — add products and their
              per-product factory notes appear here.
            </p>
          ) : (
            lines.map((line, i) => (
              <NoteEditor
                key={line.id}
                label={
                  line.productName ??
                  line.itemCode ??
                  `Line ${i + 1}`
                }
                sub={line.itemCode ?? undefined}
                initial={line.productionNotes}
                placeholder="e.g. use pressing tool P-204, deburr both faces"
                onSave={(value) =>
                  updateLineProductionNotes(salesOrderId, line.id, value)
                }
              />
            ))
          )}
        </div>

        <p
          className="rounded-xl border border-dashed px-4 py-3.5 text-[12.5px] leading-relaxed text-ink-muted"
          style={{
            borderColor: "color-mix(in srgb, var(--color-amber) 45%, transparent)",
            background: "color-mix(in srgb, var(--color-amber) 6%, transparent)",
          }}
        >
          <span
            className="mr-1.5 text-[10px] font-black uppercase tracking-[0.14em]"
            style={{ color: "var(--color-amber-deep)" }}
          >
            Pending
          </span>
          The exact extra production fields the factory copy should carry are
          still to be collected from Alok. Until then the factory copy prints the
          internal grade, internal production code, production part no and these
          notes — all of which already exist against each product. No further
          fields have been invented.
        </p>
      </div>
    </SectionCard>
  );
}

/** A textarea + explicit Save. Dirty-only: Save is disabled until edited. */
function NoteEditor({
  label,
  sub,
  initial,
  placeholder,
  onSave,
}: {
  label: string;
  sub?: string;
  initial: string | null;
  placeholder: string;
  onSave: (
    value: string | null,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(initial ?? "");
  const [saving, setSaving] = React.useState(false);
  const baseline = initial ?? "";
  const dirty = value !== baseline;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    const res = await onSave(value.trim() === "" ? null : value);
    setSaving(false);
    if (res.ok) {
      fireToast({ message: "Production notes saved." });
      router.refresh();
    } else {
      fireToast({ message: res.error, type: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[13px] font-bold text-ink-strong">{label}</span>
        {sub && (
          <span
            className="text-ink-subtle"
            style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}
          >
            {sub}
          </span>
        )}
      </div>
      <textarea
        className="nt-input min-h-[76px] resize-y"
        value={value}
        placeholder={placeholder}
        maxLength={4000}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl/Cmd+Enter saves without leaving the keyboard.
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void save();
          }
        }}
      />
      <div className="flex items-center justify-end gap-2">
        {dirty && (
          <button
            type="button"
            onClick={() => setValue(baseline)}
            className="text-[12.5px] font-semibold text-ink-muted transition-colors hover:text-ink-strong"
          >
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-1.5 rounded-pill px-4 py-1.5 text-[12.5px] font-bold text-white transition-opacity disabled:opacity-45"
          style={{
            background:
              "#454595",
          }}
        >
          {saving && (
            <Loader2
              size={12}
              style={{ animation: "spinFast 0.8s linear infinite" }}
            />
          )}
          Save
        </button>
      </div>
    </div>
  );
}
