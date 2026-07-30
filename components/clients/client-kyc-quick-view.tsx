"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Pencil, Power, X, Loader2, FileText, FileDown, FileType2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { getClientRecordForView } from "@/app/(app)/clients/actions";
import { deleteClient, reactivateClient } from "@/app/(admin)/admin/clients/actions";
import { GST_REGISTRATION_TYPE_LABELS, type GstRegistrationType } from "@/db/enums";
import type { ClientRecord } from "@/lib/queries/clients";

/*
 * ClientKycQuickView - a read-only popup that shows EVERY detail entered on the
 * Client KYC form for one client: identity, classification, registration & tax,
 * all contacts, all addresses, commercial & credit, banking, the meeting and
 * business-card scans. It fetches the full record on open (getClientRecordForView)
 * so the register only needs the client id. Used from the Client Master register
 * row menu and the client record page (beside Edit).
 */

interface Props {
  clientId: string;
  /** Instant header while the full record loads. */
  name?: string;
  isActive?: boolean;
  isAdmin: boolean;
  onClose: () => void;
}

function fmtDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function joinName(first?: string | null, last?: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim();
}

/** One labelled read-only field; renders nothing when the value is empty. */
function Item({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wide font-semibold text-ink-subtle">{label}</dt>
      <dd className="text-[14px] leading-snug text-ink-strong font-medium break-words">{value}</dd>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  // Render nothing when the whole section has no populated Items.
  const has = React.Children.toArray(children).some(Boolean);
  if (!has) return null;
  return (
    <section className="border-t border-hairline px-7 py-5">
      <h3 className="mb-3 text-[12px] uppercase tracking-[0.16em] font-bold text-brand">{title}</h3>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
    </section>
  );
}

export function ClientKycQuickView({ clientId, name, isActive, isAdmin, onClose }: Props) {
  const router = useRouter();
  const [rec, setRec] = React.useState<ClientRecord | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    getClientRecordForView(clientId)
      .then((r) => {
        if (alive) setRec(r);
      })
      .catch(() => {
        if (alive) fireToast({ message: "Couldn't load the client details.", type: "error" });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [clientId]);

  async function toggleActive() {
    if (!rec) return;
    setPending(true);
    try {
      const res = rec.isActive ? await deleteClient(rec.id) : await reactivateClient(rec.id);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: rec.isActive ? `${rec.name} deactivated.` : `${rec.name} reactivated.` });
      router.refresh();
      onClose();
    } finally {
      setPending(false);
    }
  }

  const displayName = rec?.name ?? name ?? "Client";
  const active = rec?.isActive ?? isActive ?? true;

  const primary = rec?.contacts.find((c) => c.isPrimary) ?? rec?.contacts[0];
  const additional = (rec?.contacts ?? []).filter((c) => c !== primary);
  const cards = [rec?.businessCardFrontUrl, rec?.businessCardBackUrl, ...(rec?.businessCardOtherUrls ?? [])].filter(
    Boolean,
  ) as string[];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-[min(94vw,860px)] max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-hairline bg-white px-7 pt-6 pb-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-ink-subtle">
              Client Master &middot; KYC Details
            </div>
            <h2 className="mt-1 text-[24px] leading-tight font-bold text-ink-strong break-words">
              {displayName}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
                  active
                    ? "bg-[var(--color-green-bg)] text-[var(--color-green-deep)]"
                    : "bg-[rgba(15,23,42,0.05)] text-ink-subtle"
                }`}
              >
                {active ? "Active" : "Inactive"}
              </span>
              {rec?.clientCode && (
                <span className="font-mono text-[12px] font-semibold text-ink-soft">{rec.clientCode}</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-ink-subtle hover:bg-surface-soft hover:text-ink-strong"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        {loading || !rec ? (
          <div className="flex items-center justify-center gap-2 px-7 py-16 text-ink-subtle">
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-[14px] font-medium">Loading KYC details…</span>
              </>
            ) : (
              <span className="text-[14px] font-medium">Couldn&apos;t load this client.</span>
            )}
          </div>
        ) : (
          <>
            <Section title="Identity & Classification">
              <Item label="Company Name" value={rec.name} />
              <Item label="Client Code" value={rec.clientCode} />
              <Item label="Grade" value={rec.grade} />
              <Item label="Sales Person" value={rec.salesPersonName} />
              <Item label="Export" value={rec.export == null ? null : rec.export ? "Yes" : "No"} />
              <Item label="Customer Type" value={rec.customerTypeNames.join(", ")} />
              <Item label="Industry Type" value={rec.industryTypeNames.join(", ")} />
              <Item label="Product Types" value={rec.productTypeNames.join(", ")} />
              <Item label="Tags" value={(rec.tags ?? []).join(", ")} />
            </Section>

            <Section title="Registration & Tax">
              <Item label="GSTIN" value={rec.gstin} />
              <Item label="PAN / IT No" value={rec.panNo} />
              <Item label="MSME / Udyam No" value={rec.msmeUdyamNo} />
              <Item
                label="GST Registration Type"
                value={
                  rec.gstRegistrationType
                    ? GST_REGISTRATION_TYPE_LABELS[rec.gstRegistrationType as GstRegistrationType]
                    : null
                }
              />
              <Item label="Place of Supply" value={rec.placeOfSupply} />
              <Item label="Currency" value={rec.currency} />
              <Item label="Country" value={rec.country} />
              <Item label="State" value={rec.state} />
              <Item label="City" value={rec.city} />
              <Item label="Pin Code" value={rec.pinCode} />
            </Section>

            {primary && (
              <Section title="Primary Contact">
                <Item label="Name" value={joinName(primary.firstName, primary.lastName)} />
                <Item label="Designation" value={primary.designation} />
                <Item label="Contact No" value={primary.contactNo} />
                <Item label="Email" value={primary.email} />
                <Item label="Notes" value={primary.notes} />
              </Section>
            )}

            {additional.length > 0 && (
              <section className="border-t border-hairline px-7 py-5">
                <h3 className="mb-3 text-[12px] uppercase tracking-[0.16em] font-bold text-brand">
                  Additional Contacts
                </h3>
                <div className="flex flex-col gap-4">
                  {additional.map((c, i) => (
                    <dl
                      key={c.id ?? i}
                      className="grid grid-cols-1 gap-x-8 gap-y-2 rounded-lg bg-surface-soft px-4 py-3 sm:grid-cols-2 lg:grid-cols-3"
                    >
                      <Item label="Name" value={joinName(c.firstName, c.lastName)} />
                      <Item label="Designation" value={c.designation} />
                      <Item label="Contact No" value={c.contactNo} />
                      <Item label="Email" value={c.email} />
                      <Item label="Notes" value={c.notes} />
                    </dl>
                  ))}
                </div>
              </section>
            )}

            {rec.addresses.length > 0 && (
              <section className="border-t border-hairline px-7 py-5">
                <h3 className="mb-3 text-[12px] uppercase tracking-[0.16em] font-bold text-brand">
                  Addresses
                </h3>
                <div className="flex flex-col gap-4">
                  {rec.addresses.map((a, i) => (
                    <div key={a.id ?? i} className="rounded-lg bg-surface-soft px-4 py-3">
                      <div className="mb-2 text-[12px] font-bold text-ink-strong">
                        {a.label || (a.addressType ? a.addressType.replace(/_/g, " ") : `Address ${i + 1}`)}
                        {a.isPrimary ? " · Primary" : ""}
                      </div>
                      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                        <Item
                          label="Address"
                          value={[a.line1, a.line2, a.line3, a.line4].filter(Boolean).join(", ")}
                        />
                        <Item label="City" value={a.city} />
                        <Item label="State" value={a.state} />
                        <Item label="Country" value={a.country} />
                        <Item label="Pin Code" value={a.pinCode} />
                        <Item label="GSTIN" value={a.gstin} />
                      </dl>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <Section title="Commercial & Credit">
              <Item label="Payment Terms" value={rec.paymentTerms} />
              <Item label="Freight Charges" value={rec.freightCharges} />
              <Item label="Quantity Deviation" value={rec.qtyDeviation} />
              <Item label="Credit Days" value={rec.creditDays != null ? String(rec.creditDays) : null} />
              <Item
                label="Credit Limit"
                value={rec.creditLimit != null ? `₹${Number(rec.creditLimit).toLocaleString("en-IN")}` : null}
              />
              <Item label="Transporter" value={rec.transporter} />
              <Item label="Bill To" value={rec.billToAddress} />
              <Item label="Ship To" value={rec.shipToAddress} />
              <Item label="Other References" value={rec.otherReferences} />
            </Section>

            {rec.bankAccounts.length > 0 ? (
              <section className="border-t border-hairline px-7 py-5">
                <h3 className="mb-3 text-[12px] uppercase tracking-[0.16em] font-bold text-brand">
                  Bank Details
                </h3>
                <div className="flex flex-col gap-4">
                  {rec.bankAccounts.map((b, i) => (
                    <dl
                      key={b.id ?? i}
                      className="grid grid-cols-1 gap-x-8 gap-y-2 rounded-lg bg-surface-soft px-4 py-3 sm:grid-cols-2 lg:grid-cols-3"
                    >
                      <Item label="Bank Name" value={b.bankName} />
                      <Item label="Account No" value={b.accountNo} />
                      <Item label="IFSC" value={b.ifsc} />
                      <Item label="Branch" value={b.branch} />
                      <Item label="Account Holder" value={b.accountHolder} />
                      <Item label="Account Type" value={b.accountType} />
                    </dl>
                  ))}
                </div>
              </section>
            ) : (
              <Section title="Bank Details">
                <Item label="Bank Name" value={rec.bankName} />
                <Item label="Account No" value={rec.bankAccountNo} />
                <Item label="IFSC" value={rec.bankIfsc} />
                <Item label="Branch" value={rec.bankBranch} />
                <Item label="Account Holder" value={rec.bankAccountHolder} />
              </Section>
            )}

            <Section title="KYC Meeting">
              <Item label="Meeting Date" value={fmtDate(rec.kycMeetingDate)} />
              <Item label="Start" value={rec.kycMeetingStart} />
              <Item label="End" value={rec.kycMeetingEnd} />
              <Item label="Sales Person" value={rec.salesPersonName} />
              <Item label="Meeting Notes" value={rec.kycMeetingNotes} />
            </Section>

            <Section title="Notes">
              <Item label="General Notes" value={rec.notes} />
            </Section>

            {cards.length > 0 && (
              <section className="border-t border-hairline px-7 py-5">
                <h3 className="mb-3 text-[12px] uppercase tracking-[0.16em] font-bold text-brand">
                  Business Cards & Scans
                </h3>
                <div className="flex flex-wrap gap-3">
                  {cards.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-2 text-[13px] font-semibold text-ink-soft hover:border-brand hover:text-brand"
                    >
                      <FileText size={14} strokeWidth={2.2} />
                      {i === 0 ? "Front" : i === 1 ? "Back" : `Scan ${i + 1}`}
                    </a>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* Footer */}
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-hairline bg-white px-7 py-4">
          {isAdmin && rec && (
            <button
              type="button"
              onClick={toggleActive}
              disabled={pending}
              className="mr-auto inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50"
              style={{
                borderColor: "color-mix(in srgb, var(--color-red) 40%, transparent)",
                color: "var(--color-red)",
              }}
            >
              <Power size={14} strokeWidth={2.4} />
              {rec.isActive ? "Deactivate" : "Reactivate"}
            </button>
          )}
          <a
            href={`/clients/${clientId}/kyc.pdf`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3.5 py-2 text-[13px] font-semibold text-ink-soft hover:border-brand hover:text-brand"
          >
            <FileDown size={14} strokeWidth={2.2} />
            PDF
          </a>
          <a
            href={`/clients/${clientId}/kyc.docx`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3.5 py-2 text-[13px] font-semibold text-ink-soft hover:border-brand hover:text-brand"
          >
            <FileType2 size={14} strokeWidth={2.2} />
            Word
          </a>
          <Link
            href={`/clients/${clientId}` as Route}
            className="inline-flex items-center rounded-lg border border-hairline px-4 py-2 text-[13px] font-semibold text-ink-soft hover:border-brand hover:text-brand"
          >
            Full Record
          </Link>
          <Link
            href={`/clients/${clientId}/edit` as Route}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-deep"
          >
            <Pencil size={14} strokeWidth={2.4} />
            Edit
          </Link>
        </div>
      </div>
    </div>
  );
}
