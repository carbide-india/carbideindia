import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Download, ShieldAlert } from "lucide-react";
import type { SalesOrderDocument } from "@/lib/sales-orders/so-document";
import { Chip } from "@/components/inquiries/chip";
import { PrintCopyButton } from "@/components/sales-orders/so-copy-actions";

/**
 * On-screen preview of ONE of a sales order's two copies.
 *
 * Renders the very same `SalesOrderDocument` the PDF route renders, so what is
 * previewed is what prints. The FACTORY copy is marked internal three ways -
 * amber accent, a standing banner, and a per-section INTERNAL tag - because a
 * page that walks out to a customer must be obvious at a glance. Brand red is
 * the app's error role and is deliberately not used for "internal".
 *
 * `@media print` strips the app chrome so Ctrl+P / the Print button produce a
 * clean sheet without needing a second layout.
 */

interface Props {
  document: SalesOrderDocument;
  salesOrderId: string;
  /** Route of the matching PDF download. */
  pdfHref: string;
  /** Route of the OTHER copy, for one-click comparison. */
  otherCopyHref: string;
  otherCopyLabel: string;
}

const PRINT_CSS = `
@media print {
  .no-print { display: none !important; }
  .so-copy-sheet { border: none !important; box-shadow: none !important; padding: 0 !important; }
  body { background: #fff !important; }
}
`;

export function SoCopyView({
  document: doc,
  salesOrderId,
  pdfHref,
  otherCopyHref,
  otherCopyLabel,
}: Props) {
  const accent = doc.internal ? "var(--color-amber-deep)" : "var(--color-brand)";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-8 sm:px-6">
      <style>{PRINT_CSS}</style>

      {/* ── Toolbar (never prints) ─────────────────────────────────────── */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/sales-orders/${salesOrderId}` as Route}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted transition-colors hover:text-ink-strong"
        >
          <ArrowLeft size={14} strokeWidth={2.4} />
          Back to {doc.soNo}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={otherCopyHref as Route}
            className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-4 py-2 text-[13.5px] font-bold text-ink-strong transition-colors hover:border-hairline-strong hover:bg-surface-soft"
          >
            View {otherCopyLabel}
          </Link>
          <PrintCopyButton />
          <a
            href={pdfHref}
            className="inline-flex items-center gap-1.5 rounded-pill px-5 py-2 text-[13.5px] font-bold text-white"
            style={{
              background: doc.internal
                ? "var(--color-amber-deep)"
                : "#454595",
            }}
          >
            <Download size={14} strokeWidth={2.6} />
            Download PDF
          </a>
        </div>
      </div>

      {/* ── The sheet ──────────────────────────────────────────────────── */}
      <article className="so-copy-sheet rounded-section border border-hairline bg-surface-card p-7 max-sm:p-4">
        <header
          className="flex flex-wrap items-start justify-between gap-4 border-b-2 pb-4"
          style={{ borderColor: accent }}
        >
          <div className="min-w-0">
            <p
              className="text-[11px] font-black uppercase tracking-[0.16em]"
              style={{ color: accent }}
            >
              Carbide India · Sales Order · {doc.copyLabel}
            </p>
            <h1 className="mt-1 font-mono text-[30px] leading-tight tracking-tight text-ink-strong">
              {doc.soNo}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13.5px] text-ink-muted">
              {doc.companyName || "-"}
              {doc.smNumber && (
                <>
                  <span aria-hidden className="text-ink-subtle">
                    ·
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>
                    {doc.smNumber}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Chip label={doc.statusLabel} tone="slate" />
            <Chip label={doc.sentLabel} tone={doc.sent ? "green" : "slate"} />
          </div>
        </header>

        {doc.internal && (
          <div
            className="mt-4 flex items-start gap-2.5 rounded-xl border px-4 py-3"
            style={{
              background: "color-mix(in srgb, var(--color-amber) 10%, transparent)",
              borderColor: "color-mix(in srgb, var(--color-amber) 34%, transparent)",
            }}
          >
            <ShieldAlert
              size={16}
              strokeWidth={2.4}
              style={{ color: "var(--color-amber-deep)", marginTop: 1 }}
            />
            <p
              className="text-[12.5px] font-semibold leading-snug"
              style={{ color: "var(--color-amber-deep)" }}
            >
              Internal — factory copy. Carries internal grades, production codes
              and shop-floor notes. Not for the customer.
            </p>
          </div>
        )}

        {doc.sections.map((section) => (
          <section key={section.title} className="mt-6">
            <SectionTitle
              title={section.title}
              internal={section.internal === true}
              accent={accent}
            />
            <DocGrid rows={section.rows} />
          </section>
        ))}

        {doc.lines.length > 0 && (
          <section className="mt-6">
            <SectionTitle title="Products" internal={false} accent={accent} />
            <div className="flex flex-col gap-3">
              {doc.lines.map((line, i) => (
                <div
                  key={`${line.heading}-${i}`}
                  className="rounded-xl border border-hairline bg-surface-soft px-4 py-3.5"
                >
                  <p className="text-[13.5px] font-bold text-ink-strong">
                    {line.heading}
                  </p>
                  <div className="mt-2">
                    <DocGrid rows={line.rows} />
                  </div>
                  {line.internalRows.length > 0 && (
                    <div
                      className="mt-3 border-t pt-3"
                      style={{
                        borderColor:
                          "color-mix(in srgb, var(--color-amber) 34%, transparent)",
                      }}
                    >
                      <p
                        className="mb-2 text-[10px] font-black uppercase tracking-[0.14em]"
                        style={{ color: "var(--color-amber-deep)" }}
                      >
                        Production detail · Internal
                      </p>
                      <DocGrid rows={line.internalRows} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {doc.lines.length === 0 && (
          <p className="mt-6 rounded-xl border border-dashed border-hairline-strong px-4 py-6 text-center text-[13px] font-semibold text-ink-subtle">
            No products on this sales order yet — add products before sending
            either copy.
          </p>
        )}

        {doc.pendingFieldList && <PendingFieldNotice />}
      </article>
    </div>
  );
}

function SectionTitle({
  title,
  internal,
  accent,
}: {
  title: string;
  internal: boolean;
  accent: string;
}) {
  const color = internal ? "var(--color-amber-deep)" : accent;
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block h-3 w-[3px] rounded-sm"
        style={{ background: color }}
      />
      <h2
        className="text-[11px] font-black uppercase tracking-[0.14em]"
        style={{ color }}
      >
        {title}
      </h2>
      {internal && (
        <span
          className="text-[9.5px] font-black uppercase tracking-[0.14em]"
          style={{ color: "var(--color-amber-deep)" }}
        >
          · Internal
        </span>
      )}
      <span className="h-px flex-1 bg-hairline" />
    </div>
  );
}

function DocGrid({ rows }: { rows: { label: string; value: string }[] }) {
  if (rows.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3">
      {rows.map((r) => (
        <div key={r.label} className="min-w-0">
          <dt className="text-[9.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
            {r.label}
          </dt>
          <dd className="text-[13.5px] font-semibold leading-snug text-ink-strong">
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The honest gap, printed in place. Manan asked for the factory copy but was
 * explicit that its exact extra fields must be collected from Alok in a
 * separate sitting - so the sheet says so instead of showing an invented spec.
 */
function PendingFieldNotice() {
  return (
    <section
      className="mt-6 rounded-xl border border-dashed px-4 py-4"
      style={{
        borderColor: "color-mix(in srgb, var(--color-amber) 45%, transparent)",
        background: "color-mix(in srgb, var(--color-amber) 6%, transparent)",
      }}
    >
      <p
        className="text-[10px] font-black uppercase tracking-[0.14em]"
        style={{ color: "var(--color-amber-deep)" }}
      >
        Pending — production field list
      </p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
        Additional production fields are still to be confirmed with Alok. This
        copy currently prints the internal grade, internal production code,
        production part no and production notes already held against each
        product. Any further shop-floor detail will be added here once the field
        list is agreed.
      </p>
    </section>
  );
}
