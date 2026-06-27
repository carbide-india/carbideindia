"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { MoreHorizontal, Pencil, Power } from "lucide-react";
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
          Create your first one with the button above. It then shows up in the
          Client Name picker on every task.
        </p>
      </div>
    );
  }

  return (
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
            <th className="px-5 py-4">City</th>
            <th className="px-5 py-4">Tags</th>
            <th className="px-5 py-4 tabular-nums">Tasks</th>
            <th className="px-5 py-4">Status</th>
            <th className="px-5 py-4 text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c, i) => (
            <ClientRow
              key={c.id}
              client={c}
              rowIndex={i}
              onEdit={() => router.push(`/admin/clients/${c.id}/edit` as Route)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClientRow({
  client,
  rowIndex,
  onEdit,
}: {
  client: ClientWithCount;
  rowIndex: number;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Deactivate-only (ERP Phase 4): masters are never hard-deleted. The single
  // control toggles the audited soft-deactivate / reactivate actions.
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
      className="border-b border-hairline last:border-b-0 transition-colors hover:bg-surface-soft"
      style={{ background: rowIndex % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined }}
    >
      <td className="px-5 py-4">
        <Link
          href={`/admin/clients/${client.id}` as Route}
          className="text-ink-strong font-medium hover:text-brand transition-colors"
        >
          {client.name}
        </Link>
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
      <td className="px-5 py-4 tabular-nums text-ink-soft">{client.taskCount}</td>
      <td className="px-5 py-4">
        {client.isActive ? (
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
      </td>
      <td className="px-5 py-4 text-right">
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
