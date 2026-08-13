"use client";

import * as React from "react";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Field } from "./form-field";
import type { ClientAutofill, ClientOption } from "@/lib/queries/clients";

const MODE_OPTIONS = [
  { value: "new", label: "New Client" },
  { value: "old", label: "Old Client" },
] as const;

interface Props {
  mode: "new" | "old";
  onModeChange: (mode: "new" | "old") => void;
  /** Selected existing client (Old mode). */
  clientId: string | undefined;
  onClientChange: (id: string | undefined) => void;
  clients: ClientOption[];
  /** Receives the fetched KYC snapshot - the parent form owns the RHF
   *  instance and copies the values into its own (still-editable) fields. */
  onAutofill: (data: ClientAutofill) => void;
  /** Validation message for the client picker (Old mode requires a pick). */
  error?: string;
}

/**
 * New/Old client toggle for the inquiry form. Split from the picker so the
 * layout can place the "Existing Client" picker beside Company Name rather than
 * stacked beneath the toggle.
 */
export function ClientTypeToggle({
  mode,
  onModeChange,
}: {
  mode: "new" | "old";
  onModeChange: (mode: "new" | "old") => void;
}) {
  return (
    <Field label="Client Type" labelOnly>
      <div
        role="radiogroup"
        aria-label="New or old client"
        className="relative grid w-[210px] grid-cols-2 rounded-xl border border-[#dcdce8] bg-[#f4f5f9] p-1 max-md:w-full"
      >
        {/* Sliding indigo indicator - translates between the two halves. */}
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-[#3f3f94] shadow-[0_4px_14px_rgba(63,63,148,0.4)] transition-transform duration-300 ease-[cubic-bezier(.22,.61,.36,1)]"
          style={{ transform: mode === "old" ? "translateX(100%)" : "translateX(0)" }}
        />
        {MODE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={mode === o.value}
            onClick={() => onModeChange(o.value)}
            className={cn(
              "relative z-10 rounded-lg py-2 text-center text-[13.5px] font-bold transition-colors duration-200",
              mode === o.value ? "text-white" : "text-[#6b7280] hover:text-[#3f3f94]",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

/**
 * Searchable existing-client picker (Old mode). Picking one fetches
 * `/api/clients/[id]/autofill` and hands the KYC block to the parent so the
 * client fields prefill. The values are a snapshot - everything stays editable.
 */
export function ExistingClientPicker({
  clientId,
  onClientChange,
  clients,
  onAutofill,
  error,
}: Omit<Props, "mode" | "onModeChange">) {
  const [loading, setLoading] = React.useState(false);
  // Stores the last fetched snapshot so we can display tags/notes.
  const [fetched, setFetched] = React.useState<ClientAutofill | null>(null);
  // Guards against an older fetch landing after a newer pick.
  const fetchSeq = React.useRef(0);

  async function pick(id: string) {
    onClientChange(id || undefined);
    setFetched(null);
    if (!id) return;
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${id}/autofill`);
      if (!res.ok) throw new Error(`autofill ${res.status}`);
      const data = (await res.json()) as ClientAutofill;
      if (seq !== fetchSeq.current) return; // stale response
      setFetched(data);
      onAutofill(data);
    } catch {
      if (seq === fetchSeq.current) {
        fireToast({
          message: "Couldn't fetch the client's details. Fill them in manually.",
          type: "error",
        });
      }
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }

  return (
    /* `float` so this lines up with Company Name / Export / SM Number beside it
       — a stacked label in a row of floating ones pushed its box a label-height
       lower than every neighbour. */
    <Field id="inq-client" label="Existing Client" required float>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Select
            id="inq-client"
            value={clientId ?? ""}
            onValueChange={(v) => void pick(v)}
            placeholder="Search and pick the client"
            searchPlaceholder="Search clients"
            searchable
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
        {loading && <Spinner />}
      </div>
      {loading && (
        <p className="text-[13px] text-ink-subtle">Fetching client details</p>
      )}
      {error && (
        <p className="text-[13px] font-semibold" style={{ color: "#D32F2F" }}>
          {error}
        </p>
      )}
      {!loading && fetched && <ClientContextBlock data={fetched} />}
    </Field>
  );
}

/** Compact read-only block showing client tags + notes after autofill. */
function ClientContextBlock({ data }: { data: ClientAutofill }) {
  const hasTags = Array.isArray(data.tags) && data.tags.length > 0;
  const hasNotes = typeof data.notes === "string" && data.notes.length > 0;
  if (!hasTags && !hasNotes) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-hairline bg-surface-soft px-4 py-3">
      {hasTags && (
        <div className="flex flex-wrap gap-1.5">
          {(data.tags ?? []).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-chip px-2 py-0.5 text-[12px] font-semibold"
              style={{
                background: "rgba(63,63,148,0.1)",
                color: "var(--color-brand-indigo, #3F3F94)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {hasNotes && (
        <p className="text-[12px] text-muted-foreground leading-snug">{data.notes}</p>
      )}
    </div>
  );
}
