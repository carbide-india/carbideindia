"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { fireToast } from "@/lib/toast";
import { createRole } from "@/app/(admin)/admin/roles/actions";
import { ROLE_NAME_HINT, normalizeRoleName } from "@/lib/roles/canonical";
import { AdminInlineError } from "@/components/admin/admin-inline-error";

/**
 * Create a custom role. The identifier is derived from the display name as you
 * type (and stays editable) because it is what `requireRole("…")` will quote.
 */
export function RolesCreateDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [sortOrder, setSortOrder] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setLabel("");
    setName("");
    setNameTouched(false);
    setSortOrder(100);
    setError(null);
  }

  function onLabelChange(next: string) {
    setLabel(next);
    if (!nameTouched) setName(normalizeRoleName(next));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createRole({
        name: normalizeRoleName(name),
        label: label.trim(),
        sortOrder,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: `${label.trim()} created.` });
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white"
          style={{
            background:
              "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
          }}
        >
          + New role
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            New role
          </Dialog.Title>
          <Dialog.Description
            className="text-[15px] text-[#64748B] mb-4"
            style={{ lineHeight: 1.5 }}
          >
            A role is a bundle of permissions you grant to people. It starts
            with none — open it after creating to tick what it may do.
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="role-new-label"
                className="block text-[14px] font-semibold text-[#0F172A] mb-1.5"
              >
                Display name
              </label>
              <input
                id="role-new-label"
                required
                autoFocus
                value={label}
                onChange={(e) => onLabelChange(e.target.value)}
                maxLength={60}
                placeholder="Store Keeper"
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
              />
            </div>
            <div>
              <label
                htmlFor="role-new-name"
                className="block text-[14px] font-semibold text-[#0F172A] mb-1.5"
              >
                Identifier
              </label>
              <input
                id="role-new-name"
                required
                value={name}
                onChange={(e) => {
                  setNameTouched(true);
                  setName(e.target.value);
                }}
                maxLength={32}
                placeholder="store_keeper"
                aria-describedby="role-new-name-hint"
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] font-mono"
              />
              <p id="role-new-name-hint" className="mt-1.5 text-[13px] text-[#94A3B8]">
                {ROLE_NAME_HINT} Server code will quote it as{" "}
                <code className="font-mono">
                  requireRole(&quot;{normalizeRoleName(name) || "…"}&quot;)
                </code>
                .
              </p>
            </div>
            <div>
              <label
                htmlFor="role-new-sort"
                className="block text-[14px] font-semibold text-[#0F172A] mb-1.5"
              >
                Sort order
              </label>
              <input
                id="role-new-sort"
                type="number"
                min={0}
                max={9999}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className="w-28 rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] tabular-nums"
              />
              <p className="mt-1.5 text-[13px] text-[#94A3B8]">
                Lower numbers appear first. Default 100.
              </p>
            </div>
            {error ? (
              <AdminInlineError>
                {error}
              </AdminInlineError>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2.5 text-[14px] font-medium text-[#64748B]"
                  disabled={pending}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending || label.trim().length < 2 || name.trim().length < 2}
                className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
                }}
              >
                {pending ? "Creating" : "Create role"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
