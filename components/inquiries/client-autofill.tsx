"use client";

import * as React from "react";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { fireToast } from "@/lib/toast";
import { Field, Segmented } from "./form-field";
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
  /** Receives the fetched KYC snapshot — the parent form owns the RHF
   *  instance and copies the values into its own (still-editable) fields. */
  onAutofill: (data: ClientAutofill) => void;
  /** Validation message for the client picker (Old mode requires a pick). */
  error?: string;
}

/**
 * New/Old client toggle for the inquiry form. "Old" reveals a searchable
 * client picker; picking one fetches `/api/clients/[id]/autofill` and hands
 * the KYC block to the parent so the client fields prefill. The values are a
 * snapshot — everything stays editable after autofill.
 */
export function ClientAutofillSection({
  mode,
  onModeChange,
  clientId,
  onClientChange,
  clients,
  onAutofill,
  error,
}: Props) {
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

  // Clear snapshot when switching back to "new"
  const handleModeChange = (m: "new" | "old") => {
    if (m === "new") setFetched(null);
    onModeChange(m);
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label="Client Type" labelOnly>
        <Segmented
          size="lg"
          options={MODE_OPTIONS}
          value={mode}
          onChange={(m) => {
            if (m) handleModeChange(m);
          }}
          allowClear={false}
          ariaLabel="New or old client"
        />
      </Field>

      {mode === "old" && (
        <Field id="inq-client" label="Existing Client" required>
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
          {loading ? (
            <p className="text-[13px] text-ink-subtle">
              Fetching client details
            </p>
          ) : (
            <p className="text-[13px] text-ink-subtle">
              Picking a client copies its KYC details below — you can still
              edit everything before saving.
            </p>
          )}
          {error && (
            <p className="text-[13px] font-semibold" style={{ color: "#D32F2F" }}>
              {error}
            </p>
          )}
          {!loading && fetched && <ClientContextBlock data={fetched} />}
        </Field>
      )}
    </div>
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
