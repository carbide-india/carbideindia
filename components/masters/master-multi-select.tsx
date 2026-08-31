"use client";

import * as React from "react";
import { Check, ChevronDown, Loader2, Plus, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { fireToast } from "@/lib/toast";

export interface MasterMultiSelectOption {
  id: string;
  name: string;
}

/**
 * A multi-select master picker rendered as a proper dropdown FIELD — replacing
 * the old wall of checkbox chips. Closed, it reads like the form's other fields
 * (label above, themed box) and shows the current selection AS CHIPS so it is
 * obvious what is picked without opening it. Open, it is a searchable checklist.
 *
 * Selection is a `string[]` of option ids, driven by the caller (usually a RHF
 * Controller). An optional `add` control (e.g. the "+ Add" master modal) sits
 * beside the box for admins.
 */
export function MasterMultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "Select…",
  onCreate,
  ariaLabel,
}: {
  label?: string;
  options: MasterMultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /**
   * When provided, an inline "Add new" row appears at the foot of the list.
   * It should create the option and resolve to the action result; the new
   * option flows back in via `options` (e.g. after a router refresh).
   */
  onCreate?: (name: string) => Promise<{ ok: boolean; error?: string }>;
  ariaLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const nameFor = React.useMemo(
    () => new Map(options.map((o) => [o.id, o.name])),
    [options],
  );

  const toggle = (id: string) =>
    onChange(
      selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id],
    );
  const remove = (id: string) => onChange(selected.filter((v) => v !== id));

  async function submitNew() {
    const v = newName.trim();
    if (!v || !onCreate) return;
    setCreating(true);
    try {
      const res = await onCreate(v);
      if (res.ok) {
        setNewName("");
        fireToast({ message: `"${v}" added.`, type: "success" });
      } else {
        fireToast({ message: res.error ?? "Could not add.", type: "error" });
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <span className="text-[12.5px] font-bold tracking-[0.005em] text-[#777985]">
          {label}
        </span>
      )}
      <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={ariaLabel ?? label}
              className="nt-input flex min-h-[42px] w-full flex-wrap items-center gap-1.5 !py-2 text-left"
            >
              {selected.length === 0 ? (
                <span className="font-normal text-[#a8a8a8]">{placeholder}</span>
              ) : (
                selected.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-[3px] border border-[#454595]/30 bg-[#454595]/10 px-1.5 py-0.5 text-[12px] font-semibold text-[#1f2547]"
                  >
                    {nameFor.get(id) ?? id}
                    {/* Remove a chip without opening the menu. */}
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label={`Remove ${nameFor.get(id) ?? id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(id);
                      }}
                      className="text-[#777985] transition-colors hover:text-[#d03232]"
                    >
                      <X size={12} strokeWidth={2.6} />
                    </span>
                  </span>
                ))
              )}
              <ChevronDown size={15} className="ml-auto shrink-0 text-[#777985]" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[min(360px,92vw)] p-0"
          >
            <Command>
              <CommandInput placeholder={`Search ${label ?? "options"}…`} />
              <CommandList className="max-h-64 overflow-auto">
                <CommandEmpty className="px-3 py-4 text-[13px] text-ink-subtle">
                  No matches.
                </CommandEmpty>
                {options.map((opt) => {
                  const checked = selected.includes(opt.id);
                  return (
                    <CommandItem
                      key={opt.id}
                      // cmdk fuzzy-matches on `value`; search the readable name,
                      // keep the id to stay unique.
                      value={`${opt.name} ${opt.id}`}
                      onSelect={() => toggle(opt.id)}
                    >
                      <span className="flex w-full items-center gap-2">
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] transition-colors",
                            checked
                              ? "border-[#454595] bg-[#454595] text-white"
                              : "border-[#a8a8a8] bg-white text-transparent",
                          )}
                        >
                          <Check size={11} strokeWidth={3} />
                        </span>
                        <span className="flex-1 text-[#1f2547]">{opt.name}</span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandList>
            </Command>
            {/* Inline "Add new" at the foot of the list — an input + save row,
                not a nested modal (a modal inside this transformed popover
                renders in the wrong place). */}
            {onCreate ? (
              <div className="border-t border-[#e2dfdc] p-1.5">
                {adding ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void submitNew();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setAdding(false);
                          setNewName("");
                        }
                      }}
                      placeholder={`New ${label?.toLowerCase() ?? "option"}`}
                      className="h-9 flex-1 rounded-[4px] border border-[#e2dfdc] bg-white px-2.5 text-[13px] text-[#1f2547] outline-none placeholder:text-[#a8a8a8] focus:border-[#454595] focus:ring-2 focus:ring-[#454595]/20"
                    />
                    <button
                      type="button"
                      disabled={creating || !newName.trim()}
                      onClick={() => void submitNew()}
                      className="inline-flex h-9 items-center gap-1 rounded-[4px] bg-[#454595] px-3 text-[13px] font-bold text-white transition-colors hover:bg-[#3a3a80] disabled:opacity-50"
                    >
                      {creating ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Check size={14} strokeWidth={2.8} />
                      )}
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="flex w-full items-center gap-1.5 rounded-[4px] px-2 py-1.5 text-[13px] font-semibold text-[#454595] transition-colors hover:bg-[#454595]/10"
                  >
                    <Plus size={14} strokeWidth={2.8} />
                    Add new {label?.toLowerCase() ?? "option"}
                  </button>
                )}
              </div>
            ) : null}
          </PopoverContent>
        </Popover>
    </div>
  );
}
