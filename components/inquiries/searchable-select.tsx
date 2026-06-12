"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, Search } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { focusNextFrom } from "@/lib/focus-next";

interface Props {
  id?: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: readonly string[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  /** Fired when the user clicks the trigger while disabled (e.g. "select a state first"). */
  onDisabledClick?: () => void;
  /** Offer "Use ‹typed›" for values not in the list (city names off the map). */
  allowCustom?: boolean;
  invalid?: boolean;
  /** Accessible name for the trigger — use instead of a `htmlFor` label
   *  association so label-click can't toggle the popover. */
  ariaLabel?: string;
}

/**
 * Searchable combobox on cmdk + Radix Popover — type to filter, arrow keys +
 * Enter to pick, Tab/Escape to leave. Used for the Enquiry form's State and
 * the state-dependent City fields.
 */
export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
  disabled = false,
  onDisabledClick,
  allowCustom = false,
  invalid = false,
  ariaLabel,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Tab commits the highlighted option (cmdk only commits on Enter / click)
  // and moves on to the next field — same contract as components/ui/select.
  function onCommandKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const active = e.currentTarget.querySelector<HTMLElement>(
      '[cmdk-item][aria-selected="true"]',
    );
    if (!active) return;
    e.preventDefault();
    active.click(); // commits via onSelect (which also closes the popover)
    requestAnimationFrame(() => focusNextFrom(triggerRef.current, e.shiftKey ? -1 : 1));
  }

  const trimmed = query.trim();
  const filtered = trimmed
    ? options.filter((o) => o.toLowerCase().includes(trimmed.toLowerCase()))
    : [...options];
  const exactMatch = options.some((o) => o.toLowerCase() === trimmed.toLowerCase());
  const showCustom = allowCustom && trimmed.length > 0 && !exactMatch;

  function pick(next: string) {
    onChange(next === value ? undefined : next);
    setOpen(false);
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (disabled) {
          if (next) onDisabledClick?.();
          return;
        }
        setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
          // Keep the trigger in the tab order even when "disabled" so the
          // select-state-first message is reachable by keyboard too.
          aria-disabled={disabled}
          className={cn(
            "nt-input flex w-full items-center justify-between gap-2 text-left",
            disabled && "cursor-not-allowed opacity-60",
            invalid && "!border-[#D32F2F] !ring-2 !ring-[#D32F2F]/25",
          )}
        >
          <span className={cn("truncate", !value && "text-ink-subtle")}>
            {value || placeholder}
          </span>
          <ChevronDown size={15} strokeWidth={2.4} className="shrink-0 text-ink-subtle" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-[80] w-[var(--radix-popover-trigger-width)] min-w-[260px] overflow-hidden rounded-xl border border-hairline-strong bg-white shadow-lg"
          onOpenAutoFocus={(e) => {
            // cmdk's input should take focus, not the content wrapper.
            e.preventDefault();
            const input = (e.currentTarget as HTMLElement | null)?.querySelector?.("input");
            (input as HTMLInputElement | null)?.focus();
          }}
        >
          <Command shouldFilter={false} loop onKeyDown={onCommandKeyDown}>
            <div className="flex items-center gap-2 border-b border-hairline px-3">
              <Search size={14} strokeWidth={2.4} className="shrink-0 text-ink-subtle" />
              <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder={searchPlaceholder}
                className="h-10 !border-b-0 !px-0 text-[14px]"
              />
            </div>
            <CommandList className="max-h-[260px] overflow-y-auto p-1.5">
              <CommandEmpty className="px-3 py-4 text-center text-[13px] text-ink-subtle">
                {showCustom ? null : emptyText}
              </CommandEmpty>
              {filtered.map((o) => (
                <CommandItem
                  key={o}
                  value={o}
                  onSelect={() => pick(o)}
                  className="flex items-center justify-between gap-2 !rounded-lg !py-2 text-[14px]"
                >
                  <span className="truncate">{o}</span>
                  {o === value && (
                    <Check size={14} strokeWidth={2.6} className="shrink-0 text-ink-strong" />
                  )}
                </CommandItem>
              ))}
              {showCustom && (
                <CommandItem
                  value={`__custom__${trimmed}`}
                  onSelect={() => pick(trimmed)}
                  className="!rounded-lg !py-2 text-[14px] font-semibold"
                >
                  Use “{trimmed}”
                </CommandItem>
              )}
            </CommandList>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
