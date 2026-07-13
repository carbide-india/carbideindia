import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Pencil } from "lucide-react";
import { formatDate, formatInr } from "@/lib/format";
import {
  ADDRESS_TYPE_LABELS,
  GST_REGISTRATION_TYPE_LABELS,
} from "@/db/enums";
import type { ClientRecord as ClientRecordType } from "@/lib/queries/clients";
import type { ClientDocument } from "@/lib/queries/client-documents";
import type { AuditEntry } from "@/lib/queries/audit";
import { ClientDocuments } from "@/components/clients/client-documents";
import { AuditHistory } from "@/components/audit/audit-history";

interface Props {
  record: ClientRecordType;
  documents: ClientDocument[];
  auditEntries: AuditEntry[];
}

export function ClientRecord({ record, documents, auditEntries }: Props) {
  /* ── Composed address ──────────────────────────────────────────────── */
  const registeredAddress = composeAddress({
    line1: record.addressLine1,
    line2: record.addressLine2,
    line3: record.addressLine3,
    line4: record.addressLine4,
    city: record.city,
    state: record.state,
    country: record.country,
    pin: record.pinCode,
  });

  /* ── Contacts list ─────────────────────────────────────────────────── */
  const hasContacts = record.contacts.length > 0;

  /* ── Business cards ────────────────────────────────────────────────── */
  const hasBusinessCards =
    !!(record.businessCardFrontUrl || record.businessCardBackUrl);

  /* ── Meeting ───────────────────────────────────────────────────────── */
  const hasMeeting =
    !!(record.kycMeetingDate || record.kycMeetingStart || record.kycMeetingEnd || record.kycMeetingNotes);
  const hasMeetingOrNotes = hasMeeting || !!record.notes;

  /* ── Credit limit (numeric → string from Drizzle) ──────────────────── */
  const creditLimitFormatted =
    record.creditLimit != null
      ? formatInr(Number(record.creditLimit))
      : null;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Breadcrumb ─────────────────────────────────────────────────── */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px]">
        <Link
          href={"/clients" as Route}
          className="inline-flex items-center gap-1.5 font-semibold text-ink-muted hover:text-ink-strong transition-colors"
        >
          <ArrowLeft size={14} strokeWidth={2.4} />
          Clients
        </Link>
        <span className="text-ink-subtle">/</span>
        {record.clientCode && (
          <>
            <span className="font-mono text-ink-subtle">{record.clientCode}</span>
            <span className="text-ink-subtle">/</span>
          </>
        )}
        <span className="text-ink-subtle truncate max-w-[200px]">{record.name}</span>
      </nav>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] uppercase tracking-[0.18em] font-bold text-ink-subtle">
            Client Master · Record
          </p>
          <h1 className="text-[36px] font-bold leading-tight tracking-tight text-ink-strong mt-1">
            {record.name}
          </h1>
          {/* Status chip */}
          <div className="mt-2">
            {record.isActive ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
                style={{ background: "var(--color-green-bg)", color: "var(--color-green-deep)" }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-green)" }} />
                Active
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
                style={{ background: "rgba(15, 23, 42, 0.05)", color: "var(--color-ink-subtle)" }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-ink-subtle)" }} />
                Inactive
              </span>
            )}
          </div>
        </div>
        {/* Edit button */}
        <Link
          href={`/clients/${record.id}/edit` as Route}
          className="inline-flex items-center gap-1.5 h-9 rounded-lg border border-hairline px-3 text-[13px] font-semibold text-ink-soft hover:border-brand hover:text-brand transition-colors"
        >
          <Pencil size={15} strokeWidth={2.2} />
          Edit
        </Link>
      </header>

      {/* ── Cards ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-6">

        {/* 1. Business Profile */}
        <ReadCard title="Business Profile">
          <InfoGrid
            rows={[
              [
                "Customer Type",
                record.customerTypeNames.length > 0
                  ? record.customerTypeNames.join(", ")
                  : null,
              ],
              [
                "Industry Type",
                record.industryTypeNames.length > 0
                  ? record.industryTypeNames.join(", ")
                  : null,
              ],
              [
                "Product Types",
                record.productTypeNames.length > 0
                  ? record.productTypeNames.join(", ")
                  : null,
              ],
              [
                "Tags",
                record.tags && record.tags.length > 0
                  ? record.tags.join(", ")
                  : null,
              ],
              ["Sales Person", record.salesPersonName],
            ]}
          />
        </ReadCard>

        {/* 2. Registration & Tax */}
        <ReadCard title="Registration & Tax">
          <InfoGrid
            rows={[
              ["GSTIN", record.gstin],
              ["PAN", record.panNo],
              ["MSME / Udyam No", record.msmeUdyamNo],
              [
                "GST Registration Type",
                record.gstRegistrationType
                  ? GST_REGISTRATION_TYPE_LABELS[record.gstRegistrationType]
                  : null,
              ],
              ["Place of Supply", record.placeOfSupply],
            ]}
          />
        </ReadCard>

        {/* 3. Addresses */}
        <ReadCard title="Addresses">
          {record.addresses.length > 0 ? (
            <div className="flex flex-col gap-4">
              {record.addresses.map((addr) => {
                const lines = addressLines({
                  line1: addr.line1,
                  line2: addr.line2,
                  line3: addr.line3,
                  line4: addr.line4,
                  city: addr.city,
                  state: addr.state,
                  country: addr.country,
                  pin: addr.pinCode,
                });
                return (
                  <div
                    key={addr.id}
                    className="flex flex-col gap-2.5 border-b border-hairline pb-5 last:border-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink-strong">
                        {ADDRESS_TYPE_LABELS[addr.addressType]}
                      </span>
                      {addr.label && (
                        <span className="text-[13px] text-ink-muted">
                          {addr.label}
                        </span>
                      )}
                      {addr.isPrimary && <PrimaryChip />}
                    </div>
                    {lines.length > 0 ? (
                      <address className="not-italic text-[14px] leading-relaxed text-ink-strong">
                        {lines.map((line, idx) => (
                          <span key={idx} className="block break-words">
                            {line}
                          </span>
                        ))}
                      </address>
                    ) : (
                      <p className="text-[13px] text-ink-subtle">No address on file</p>
                    )}
                    {addr.notes && (
                      <p className="text-[13px] text-ink-muted break-words">
                        {addr.notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <InfoGrid
              rows={[
                ["Registered Address", registeredAddress],
                ["Bill-to Address", record.billToAddress],
                ["Ship-to Address", record.shipToAddress],
              ]}
            />
          )}
        </ReadCard>

        {/* 4. Contacts */}
        {hasContacts && (
          <ReadCard title="Contacts">
            <div className="flex flex-col gap-4">
              {record.contacts.map((contact) => {
                const fullName = [contact.firstName, contact.lastName]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <div key={contact.id} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink-strong">
                        {fullName || "Not Available"}
                      </span>
                      {contact.isPrimary && (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{
                            background: "var(--color-surface-soft)",
                            color: "var(--color-ink-soft)",
                            border: "1px solid var(--color-hairline)",
                          }}
                        >
                          Primary
                        </span>
                      )}
                    </div>
                    {contact.designation && (
                      <p className="text-[13px] text-ink-muted">{contact.designation}</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-soft">
                      {contact.contactNo && <span>{contact.contactNo}</span>}
                      {contact.email && <span>{contact.email}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </ReadCard>
        )}

        {/* 5. Commercial & Credit */}
        <ReadCard title="Commercial & Credit">
          <InfoGrid
            rows={[
              ["Payment Terms", record.paymentTerms],
              [
                "Credit Days",
                record.creditDays != null ? String(record.creditDays) : null,
              ],
              ["Credit Limit", creditLimitFormatted],
              ["Freight Charges", record.freightCharges],
              ["Transporter", record.transporter],
              ["Currency", record.currency],
              [
                "Export",
                record.export != null ? (record.export ? "Yes" : "No") : null,
              ],
              ["Other References", record.otherReferences],
            ]}
          />
        </ReadCard>

        {/* 6. Bank Details */}
        <ReadCard title="Bank Details">
          {record.bankAccounts.length > 0 ? (
            <div className="flex flex-col gap-4">
              {record.bankAccounts.map((bank) => (
                <div
                  key={bank.id}
                  className="flex flex-col gap-2 border-b border-hairline pb-4 last:border-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink-strong">
                      {bank.bankName ?? "Bank account"}
                    </span>
                    {bank.isPrimary && <PrimaryChip />}
                  </div>
                  <InfoGrid
                    rows={[
                      ["Account No", bank.accountNo],
                      ["IFSC", bank.ifsc],
                      ["Branch", bank.branch],
                      ["Account Holder", bank.accountHolder],
                      ["Account Type", bank.accountType],
                    ]}
                  />
                  {bank.notes && (
                    <p className="text-[13px] text-ink-muted break-words">
                      {bank.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <InfoGrid
              rows={[
                ["Bank Name", record.bankName],
                ["Account No", record.bankAccountNo],
                ["IFSC", record.bankIfsc],
                ["Branch", record.bankBranch],
                ["Account Holder", record.bankAccountHolder],
              ]}
            />
          )}
        </ReadCard>

        {/* 7. Documents */}
        <ReadCard title="Documents">
          <ClientDocuments clientId={record.id} documents={documents} />
        </ReadCard>

        {/* 8. Business Cards */}
        {hasBusinessCards && (
          <ReadCard title="Business Cards">
            <div className="flex flex-wrap gap-4">
              {record.businessCardFrontUrl && (
                <div className="flex flex-col gap-1">
                  <p className="text-[12px] font-bold text-ink-subtle">Front</p>
                  <img
                    src={record.businessCardFrontUrl}
                    alt="Business card front"
                    className="max-h-48 rounded-lg border border-hairline object-contain"
                  />
                </div>
              )}
              {record.businessCardBackUrl && (
                <div className="flex flex-col gap-1">
                  <p className="text-[12px] font-bold text-ink-subtle">Back</p>
                  <img
                    src={record.businessCardBackUrl}
                    alt="Business card back"
                    className="max-h-48 rounded-lg border border-hairline object-contain"
                  />
                </div>
              )}
            </div>
          </ReadCard>
        )}

        {/* 9. Meeting & Notes */}
        {hasMeetingOrNotes && (
          <ReadCard title="Meeting & Notes">
            <InfoGrid
              rows={[
                [
                  "KYC Meeting Date",
                  record.kycMeetingDate ? formatDate(record.kycMeetingDate) : null,
                ],
                ["Meeting Start", record.kycMeetingStart],
                ["Meeting End", record.kycMeetingEnd],
                ["Meeting Notes", record.kycMeetingNotes],
                ["Client Notes", record.notes],
              ]}
            />
          </ReadCard>
        )}

        {/* Record Info */}
        <ReadCard title="Record Info">
          <InfoGrid
            rows={[
              ["Created", formatDate(record.createdAt)],
              ["Last Updated", formatDate(record.updatedAt)],
            ]}
          />
        </ReadCard>

        {/* History */}
        <ReadCard title="History">
          <AuditHistory entries={auditEntries} />
        </ReadCard>

      </div>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function composeAddress(parts: {
  line1: string | null | undefined;
  line2: string | null | undefined;
  line3: string | null | undefined;
  line4: string | null | undefined;
  city: string | null | undefined;
  state: string | null | undefined;
  country: string | null | undefined;
  pin: string | null | undefined;
}): string | null {
  const segments: string[] = [];
  if (parts.line1) segments.push(parts.line1);
  if (parts.line2) segments.push(parts.line2);
  if (parts.line3) segments.push(parts.line3);
  if (parts.line4) segments.push(parts.line4);
  const cityStateParts: string[] = [];
  if (parts.city) cityStateParts.push(parts.city);
  if (parts.state) cityStateParts.push(parts.state);
  if (cityStateParts.length > 0) segments.push(cityStateParts.join(", "));
  if (parts.country) segments.push(parts.country);
  if (parts.pin) segments.push(`PIN: ${parts.pin}`);
  return segments.length > 0 ? segments.join(", ") : null;
}

/**
 * Returns address as separate display lines (Line 1, Line 2, City/State/Country,
 * PIN) so it stacks cleanly and never reads as one scrambled comma string.
 */
function addressLines(parts: {
  line1: string | null | undefined;
  line2: string | null | undefined;
  line3: string | null | undefined;
  line4: string | null | undefined;
  city: string | null | undefined;
  state: string | null | undefined;
  country: string | null | undefined;
  pin: string | null | undefined;
}): string[] {
  const lines: string[] = [];
  if (parts.line1) lines.push(parts.line1);
  if (parts.line2) lines.push(parts.line2);
  if (parts.line3) lines.push(parts.line3);
  if (parts.line4) lines.push(parts.line4);
  const locality = [parts.city, parts.state, parts.country]
    .filter(Boolean)
    .join(", ");
  if (locality) lines.push(locality);
  if (parts.pin) lines.push(`PIN ${parts.pin}`);
  return lines;
}

/* ── Read-only building blocks ───────────────────────────────────────── */

function PrimaryChip() {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{
        background: "var(--color-surface-soft)",
        color: "var(--color-ink-soft)",
        border: "1px solid var(--color-hairline)",
      }}
    >
      Primary
    </span>
  );
}

function ReadCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="bg-surface-card rounded-section border border-hairline p-6"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <h2 className="mb-4 text-[12px] uppercase tracking-[0.14em] font-bold text-ink-subtle">
        {title}
      </h2>
      {children}
    </section>
  );
}

function InfoGrid({
  rows,
}: {
  rows: ReadonlyArray<readonly [string, string | null | undefined]>;
}) {
  const visible = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (visible.length === 0) return null;
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
      {visible.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-0.5">
          <dt className="text-[12px] font-bold text-ink-subtle">{label}</dt>
          <dd className="text-[14px] text-ink-strong break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
