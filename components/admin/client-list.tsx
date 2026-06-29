"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Search, MoreHorizontal, Pencil, Power, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { deleteClient, reactivateClient } from "@/app/(admin)/admin/clients/actions";
import type { ClientWithCount } from "@/lib/queries/clients";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface Props {
  clients: ClientWithCount[];
}

export function ClientList({ clients }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [quickView, setQuickView] = useState<ClientWithCount | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.name, c.city, c.clientCode, c.gstin, c.panNo]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [clients, query]);

  if (clients.length === 0) {
    return (
      <div
        className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-6 py-14 text-center"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <p
          className="font-serif text-ink-strong"
          style={{ fontStyle: "italic", fontSize: 22, letterSpacing: "-0.015em" }}
        >
          No clients yet
        </p>
        <p className="text-[14px] text-ink-subtle mt-2 max-w-sm mx-auto" style={{ lineHeight: 1.5 }}>
          Create your first one with the button above.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 relative max-w-md">
        <Search
          size={16}
          strokeWidth={2.2}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, city, code, GSTIN…"
          className="w-full rounded-lg border border-hairline bg-surface-card py-2.5 pl-9 pr-3 text-[14px] outline-none focus:border-brand"
        />
      </div>

      <div
        className="overflow-hidden rounded-section border border-hairline bg-surface-card"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <table className="w-full text-[15px]">
          <thead>
            <tr
              className="text-left text-[12px] uppercase tracking-[0.08em] text-ink-subtle font-bold border-b border-hairline"
              style={{ background: "var(--color-surface-soft)" }}
            >
              <th className="px-5 py-4">Name</th>
              <th className="px-5 py-4">Code</th>
              <th className="px-5 py-4">City</th>
              <th className="px-5 py-4">Tags</th>
              <th className="px-5 py-4 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <ClientRow
                key={c.id}
                client={c}
                rowIndex={i}
                onOpen={() => setQuickView(c)}
                onEdit={() => router.push(`/admin/clients/${c.id}/edit` as Route)}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[14px] text-ink-subtle">
                  No clients match “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {quickView && (
        <ClientQuickView client={quickView} onClose={() => setQuickView(null)} />
      )}
    </>
  );
}

function ClientRow({
  client,
  rowIndex,
  onOpen,
  onEdit,
}: {
  client: ClientWithCount;
  rowIndex: number;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggleActive() {
    startTransition(async () => {
      const res = client.isActive
        ? await deleteClient(client.id)
        : await reactivateClient(client.id);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({
        message: client.isActive
          ? `${client.name} deactivated.`
          : `${client.name} reactivated.`,
      });
      router.refresh();
    });
  }

  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-b border-hairline last:border-b-0 transition-colors hover:bg-surface-soft"
      style={{ background: rowIndex % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined }}
    >
      <td className="px-5 py-4">
        <span className="text-ink-strong font-medium">{client.name}</span>
        {!client.isActive && (
          <span className="ml-2 rounded-full bg-[rgba(15,23,42,0.05)] px-2 py-0.5 text-[11px] font-semibold text-ink-subtle">
            Inactive
          </span>
        )}
      </td>
      <td className="px-5 py-4 font-mono text-[13px] text-ink-soft">
        {client.clientCode ?? "—"}
      </td>
      <td className="px-5 py-4 text-ink-soft">
        {client.city ? client.city : <span className="text-ink-subtle">—</span>}
      </td>
      <td className="px-5 py-4">
        {client.tags && client.tags.length > 0 ? (
          <span className="inline-flex flex-wrap gap-1">
            {client.tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center rounded-pill px-2 py-0.5 text-[12px] font-semibold"
                style={{
                  background: "var(--color-surface-soft)",
                  color: "var(--color-ink-soft)",
                  border: "1px solid var(--color-hairline)",
                }}
              >
                {t}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-ink-subtle">—</span>
        )}
      </td>
      <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            disabled={pending}
            className="inline-flex items-center gap-1.5 h-9 rounded-lg border border-hairline px-3 text-[13px] font-semibold text-ink-soft hover:border-brand hover:text-brand transition-colors disabled:opacity-50"
          >
            <Pencil size={15} strokeWidth={2.2} />
            Edit
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More client actions"
                disabled={pending}
                className="inline-flex items-center justify-center size-9 rounded-lg border border-hairline text-ink-soft hover:border-hairline-strong hover:text-ink-strong transition-colors disabled:opacity-50 data-[state=open]:border-brand data-[state=open]:text-brand"
              >
                <MoreHorizontal size={18} strokeWidth={2.2} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                danger={client.isActive}
                onSelect={(e) => {
                  e.preventDefault();
                  toggleActive();
                }}
              >
                <Power size={15} strokeWidth={2.2} />
                {client.isActive ? "Deactivate" : "Reactivate"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}

/* ── Quick-view popup ──────────────────────────────────────────────────── */

function composeAddress(c: ClientWithCount): string | null {
  const parts = [
    c.addressLine1, c.addressLine2, c.addressLine3, c.addressLine4,
    c.city, c.state, c.country,
  ].filter((v): v is string => Boolean(v && String(v).trim()));
  const base = parts.join(", ");
  const pin = c.pinCode ? ` — PIN ${c.pinCode}` : "";
  return base ? base + pin : null;
}

function ClientQuickView({
  client,
  onClose,
}: {
  client: ClientWithCount;
  onClose: () => void;
}) {
  const c = client;
  const registered = composeAddress(c);
  const bank = [c.bankName, c.bankAccountNo, c.bankIfsc, c.bankBranch]
    .filter((v): v is string => Boolean(v))
    .join(" · ");

  const rows: Array<[string, React.ReactNode]> = [
    ["Client Code", c.clientCode],
    ["GSTIN", c.gstin],
    ["PAN", c.panNo],
    ["MSME / Udyam", c.msmeUdyamNo],
    ["Registered Address", registered],
    ["Bill To", c.billToAddress],
    ["Ship To", c.shipToAddress],
    ["Payment Terms", c.paymentTerms],
    ["Credit Days", c.creditDays != null ? String(c.creditDays) : null],
    ["Credit Limit", c.creditLimit != null ? String(c.creditLimit) : null],
    ["Freight Charges", c.freightCharges],
    ["Transporter", c.transporter],
    ["Bank", bank || null],
    ["Other References", c.otherReferences],
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-ink-subtle">
              Client Master
            </div>
            <h2 className="mt-0.5 text-2xl font-bold text-ink-strong">{c.name}</h2>
            <span
              className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
                c.isActive
                  ? "bg-[var(--color-green-bg)] text-[var(--color-green-deep)]"
                  : "bg-[rgba(15,23,42,0.05)] text-ink-subtle"
              }`}
            >
              {c.isActive ? "Active" : "Inactive"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ink-subtle hover:bg-surface-soft hover:text-ink-strong"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 px-6 py-5 sm:grid-cols-2">
          {rows
            .filter(([, v]) => v != null && v !== "")
            .map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] uppercase tracking-wide font-semibold text-ink-subtle">
                  {label}
                </dt>
                <dd className="mt-0.5 text-[14px] text-ink-strong">{value}</dd>
              </div>
            ))}
        </dl>

        <div className="flex justify-end gap-2 border-t border-hairline px-6 py-4">
          <Link
            href={`/admin/clients/${c.id}` as Route}
            className="inline-flex items-center rounded-lg border border-hairline px-4 py-2 text-[13px] font-semibold text-ink-soft hover:border-brand hover:text-brand"
          >
            Full record
          </Link>
          <Link
            href={`/admin/clients/${c.id}/edit` as Route}
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
