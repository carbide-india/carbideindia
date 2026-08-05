"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatCount, formatDate, formatTime } from "@/lib/format";
import { cancelDataTransferJob } from "@/app/(admin)/admin/data/actions";
import {
  DATA_JOB_DIRECTION_LABELS,
  DATA_JOB_STATUS_LABELS,
  type DataJobStatus,
} from "@/db/enums";
import type { DataTransferJobRow } from "@/lib/queries/data";
import { AdminInlineError } from "@/components/admin/admin-inline-error";

interface Props {
  jobs: DataTransferJobRow[];
  /** Entity keys that actually appear in the log - drives the entity filter. */
  entities: string[];
  /** Pretty name per entity key, where the catalogue knows one. */
  entityLabels: Record<string, string>;
  /** Row cap the query applied, so the footer can say the list is truncated. */
  limit: number;
}

/** Status pill tone. These are job-run outcomes, not DB-managed task statuses,
 *  so the palette is the app's semantic green/amber/red - nothing hardcoded
 *  from status_settings. */
const STATUS_TONE: Record<DataJobStatus, { bg: string; fg: string }> = {
  pending: { bg: "var(--color-amber-bg)", fg: "var(--color-amber-deep)" },
  running: { bg: "var(--color-blue-bg)", fg: "var(--color-blue-deep)" },
  done: { bg: "var(--color-green-bg)", fg: "var(--color-green-deep)" },
  failed: { bg: "var(--color-red-bg)", fg: "var(--color-red-deep)" },
};

export function DataJobHistory({ jobs, entities, entityLabels, limit }: Props) {
  const [isPending, startTransition] = useTransition();
  const [cancelling, setCancelling] = React.useState<DataTransferJobRow | null>(
    null,
  );

  const opts = {
    defaultValue: "all",
    shallow: false,
    clearOnDefault: true,
    startTransition,
  } as const;
  const [direction, setDirection] = useQueryState("dir", opts);
  const [status, setStatus] = useQueryState("state", opts);
  const [entity, setEntity] = useQueryState("entity", opts);

  const filtered =
    direction !== "all" || status !== "all" || entity !== "all";

  function reset() {
    void setDirection("all");
    void setStatus("all");
    void setEntity("all");
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex flex-wrap items-center gap-3 rounded-section border border-hairline bg-surface-card px-5 py-3.5"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <span className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.09em] text-ink-subtle">
          <SlidersHorizontal size={14} strokeWidth={2.4} aria-hidden="true" />
          Filters
        </span>

        <FilterSelect
          id="job-filter-direction"
          label="Direction"
          value={direction}
          onChange={(v) => void setDirection(v)}
          options={[
            { value: "all", label: "All directions" },
            { value: "import", label: DATA_JOB_DIRECTION_LABELS.import },
            { value: "export", label: DATA_JOB_DIRECTION_LABELS.export },
          ]}
        />
        <FilterSelect
          id="job-filter-status"
          label="Outcome"
          value={status}
          onChange={(v) => void setStatus(v)}
          options={[
            { value: "all", label: "All outcomes" },
            ...(
              ["pending", "running", "done", "failed"] as const
            ).map((s) => ({ value: s, label: DATA_JOB_STATUS_LABELS[s] })),
          ]}
        />
        <FilterSelect
          id="job-filter-entity"
          label="Dataset"
          value={entity}
          onChange={(v) => void setEntity(v)}
          disabled={entities.length === 0}
          options={[
            { value: "all", label: "All datasets" },
            ...entities.map((e) => ({
              value: e,
              label: entityLabels[e] ?? e,
            })),
          ]}
        />

        {isPending && (
          <Loader2
            size={15}
            className="animate-spin text-ink-subtle"
            aria-label="Loading"
          />
        )}

        {filtered && (
          <button
            type="button"
            onClick={reset}
            className="ml-auto inline-flex items-center gap-1.5 rounded-chip px-3 py-2 text-[13px] font-semibold text-ink-subtle transition-colors hover:text-ink-strong"
          >
            <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
            Reset
          </button>
        )}
      </div>

      {jobs.length === 0 ? (
        <EmptyLog filtered={filtered} />
      ) : (
        <div
          className="overflow-x-auto rounded-section border border-hairline bg-surface-card"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <table className="w-full text-[14px]">
            <caption className="sr-only">
              Import and export runs, newest first
            </caption>
            <thead>
              <tr className="border-b border-hairline bg-surface-soft text-left text-[12px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                <th scope="col" className="px-5 py-3.5">When</th>
                <th scope="col" className="px-4 py-3.5">Direction</th>
                <th scope="col" className="px-4 py-3.5">Dataset</th>
                <th scope="col" className="px-4 py-3.5">Format</th>
                <th scope="col" className="px-4 py-3.5 text-right tabular-nums">Rows</th>
                <th scope="col" className="px-4 py-3.5 text-right tabular-nums">Errors</th>
                <th scope="col" className="px-4 py-3.5">Outcome</th>
                <th scope="col" className="px-4 py-3.5">By</th>
                <th scope="col" className="px-5 py-3.5 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job, i) => (
                <JobRow
                  key={job.id}
                  job={job}
                  rowIndex={i}
                  entityLabels={entityLabels}
                  onCancel={() => setCancelling(job)}
                />
              ))}
            </tbody>
          </table>
          {jobs.length >= limit && (
            <p className="border-t border-hairline px-5 py-3 text-[13px] text-ink-subtle tabular-nums">
              Showing the {formatCount(limit)} most recent runs. Narrow the
              filters to reach older ones.
            </p>
          )}
        </div>
      )}

      {/* Keyed on the job so each confirm starts with an empty reason field -
          cheaper and clearer than resetting state from an effect. */}
      <CancelJobDialog
        key={cancelling?.id ?? "none"}
        job={cancelling}
        onClose={() => setCancelling(null)}
      />
    </div>
  );
}

function EmptyLog({ filtered }: { filtered: boolean }) {
  return (
    <div
      className="rounded-section border border-hairline-strong bg-surface-card px-6 py-14 text-center"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <p
        className="font-serif text-ink-strong"
        style={{ fontStyle: "italic", fontSize: 22, letterSpacing: "-0.015em" }}
      >
        {filtered ? "No runs match those filters" : "Nothing has moved yet"}
      </p>
      <p className="mt-2 mx-auto max-w-md text-[14px] text-ink-subtle" style={{ lineHeight: 1.5 }}>
        {filtered
          ? "Reset the filters to see the whole log."
          : "Every bulk import and every export you run from this hub is recorded here - who ran it, which dataset, how many rows, and whether it failed."}
      </p>
    </div>
  );
}

function JobRow({
  job,
  rowIndex,
  entityLabels,
  onCancel,
}: {
  job: DataTransferJobRow;
  rowIndex: number;
  entityLabels: Record<string, string>;
  onCancel: () => void;
}) {
  const tone = STATUS_TONE[job.status];
  const inFlight = job.status === "pending" || job.status === "running";

  return (
    <tr
      className="border-b border-hairline transition-colors last:border-b-0 hover:bg-surface-soft"
      style={{
        background: rowIndex % 2 === 1 ? "rgba(15, 23, 42, 0.012)" : undefined,
      }}
    >
      <td className="px-5 py-3 whitespace-nowrap tabular-nums text-ink-soft">
        <span className="block text-ink-strong">{formatDate(job.startedAt)}</span>
        <span className="block text-[12.5px] text-ink-subtle">
          {formatTime(job.startedAt)}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap font-medium text-ink-strong">
        {DATA_JOB_DIRECTION_LABELS[job.direction]}
      </td>
      <td className="px-4 py-3 text-ink-strong">
        {entityLabels[job.entity] ?? job.entity}
      </td>
      <td className="px-4 py-3 whitespace-nowrap uppercase text-ink-soft">
        {job.format}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-ink-soft">
        {formatCount(job.rowCount)}
      </td>
      <td
        className="px-4 py-3 text-right tabular-nums"
        style={
          job.errorCount > 0
            ? { color: "var(--color-red-deep)", fontWeight: 600 }
            : { color: "var(--color-ink-subtle)" }
        }
      >
        {job.errorCount === 0 ? "—" : formatCount(job.errorCount)}
      </td>
      <td className="px-4 py-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
          style={{ background: tone.bg, color: tone.fg }}
          title={job.errorMessage ?? undefined}
        >
          {DATA_JOB_STATUS_LABELS[job.status]}
        </span>
        {job.errorMessage && (
          <span className="mt-1 block max-w-[280px] truncate text-[12px] text-ink-subtle">
            {job.errorMessage}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-ink-soft">{job.requestedByName ?? "—"}</td>
      <td className="px-5 py-3 text-right">
        {inFlight ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-[13px] font-semibold text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong"
          >
            Retire
          </button>
        ) : (
          <span className="text-[13px] text-ink-subtle">—</span>
        )}
      </td>
    </tr>
  );
}

/**
 * Confirm step for retiring a stuck run. Irreversible: the log row is marked
 * failed and never edited back, so the admin has to type a reason and press a
 * clearly-destructive button.
 */
function CancelJobDialog({
  job,
  onClose,
}: {
  job: DataTransferJobRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!job) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelDataTransferJob(job.id, reason.trim());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: "Job retired." });
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog.Root
      open={job !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/30" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] max-h-[calc(100dvh-32px)] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-lg"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <Dialog.Title className="mb-1 font-serif text-xl text-[#0F172A]">
            Retire this run?
          </Dialog.Title>
          <Dialog.Description className="mb-4 text-[15px] text-[#64748B]">
            {job
              ? `The ${job.direction} of ${job.entity} started ${formatDate(job.startedAt)} at ${formatTime(job.startedAt)} and never reported back. Retiring marks it failed in the log. This cannot be undone, and it does not roll back any rows the run already created.`
              : ""}
          </Dialog.Description>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="retire-reason"
                className="mb-1.5 block text-[14px] font-semibold text-[#0F172A]"
              >
                Reason
              </label>
              <input
                id="retire-reason"
                ref={inputRef}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={400}
                placeholder="e.g. deploy restarted mid-export"
                className="w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px]"
              />
            </div>
            {error && (
              <AdminInlineError>
                {error}
              </AdminInlineError>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={pending}
                  className="px-4 py-2.5 text-[14px] font-medium text-[#64748B]"
                >
                  Keep it
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--color-red-deep)" }}
              >
                <AlertTriangle size={15} strokeWidth={2.4} aria-hidden="true" />
                {pending ? "Retiring" : "Retire run"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <label
        htmlFor={id}
        className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-subtle"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="nt-input w-[172px] py-2 text-[13px] disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}
