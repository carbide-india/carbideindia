"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarPlus, Loader2, Lock, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  openFinancialYearCounter,
  setFySeriesNextValue,
  setSequenceNextValue,
  updateNumberingFormat,
} from "@/app/(admin)/admin/numbering/actions";
import type { NumberingFamily } from "@/lib/queries/numbering";
import { previewNumber } from "@/lib/numbering/render";
import {
  CodeOwnedNote,
  PreviewPill,
  STRATEGY_BLURB,
  StrategyBadge,
  moduleLabel,
} from "@/components/admin/numbering-bits";
import { AdminInlineError } from "@/components/admin/admin-inline-error";

interface Props {
  /**
   * The family being managed. The parent mounts this component with
   * `key={family.id}` so switching rows remounts it — local field state is
   * seeded straight from props instead of being re-synced in an effect.
   */
  family: NumberingFamily;
  currentFy: string;
  nextFy: string | null;
  sampleSmNumber: string;
  onClose: () => void;
}

/** Which counter the admin is currently re-basing. */
type CounterTarget = { kind: "fy"; fyLabel: string } | { kind: "sequence" } | null;

const MAX_COUNTER = 10_000_000;

/**
 * Manage one document family: its register entry (label / listing / — for
 * financial-year registers only — prefix and padding), and its live counters.
 *
 * Counter moves are FORWARD-ONLY and irreversible (the skipped numbers are
 * burned), so every one goes through an explicit second confirm step that spells
 * out how many numbers will be skipped before the server is called.
 */
export function NumberingFamilyDialog({
  family,
  currentFy,
  nextFy,
  sampleSmNumber,
  onClose,
}: Props) {
  const router = useRouter();

  const [label, setLabel] = React.useState(family.label);
  const [sortOrder, setSortOrder] = React.useState(family.sortOrder);
  const [isActive, setIsActive] = React.useState(family.isActive);
  const [prefix, setPrefix] = React.useState(family.prefix);
  const [padTo, setPadTo] = React.useState(family.padTo);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [savingForm, startSaveForm] = React.useTransition();

  const [target, setTarget] = React.useState<CounterTarget>(null);
  const [counterValue, setCounterValue] = React.useState("");
  const [counterError, setCounterError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [savingCounter, startSaveCounter] = React.useTransition();
  const [openingFy, startOpenFy] = React.useTransition();

  const confirmRef = React.useRef<HTMLButtonElement>(null);

  // Move focus onto the confirm button the moment the confirm step appears.
  React.useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const editable = family.canEditFormat;
  const currentCounter = family.counters.find((c) => c.isCurrentFy) ?? null;

  // The preview follows the fields being typed, using the same renderer the
  // allocator uses. For fy_series it previews the CURRENT year's next value.
  const livePreview = previewNumber(
    { strategy: family.strategy, prefix, padTo },
    {
      fyLabel: currentFy,
      nextValue:
        family.strategy === "fy_series"
          ? (currentCounter?.nextValue ?? 1)
          : family.strategy === "sequence"
            ? (family.sequence?.nextValue ?? 1)
            : 1,
      sampleSmNumber,
    },
  );

  const formDirty =
    label.trim() !== family.label ||
    sortOrder !== family.sortOrder ||
    isActive !== family.isActive ||
    (editable && (prefix !== family.prefix || padTo !== family.padTo));

  function saveFormat() {
    setFormError(null);
    const trimmed = label.trim();
    if (trimmed.length < 2) {
      setFormError("Label is required.");
      return;
    }
    startSaveForm(async () => {
      const res = await updateNumberingFormat({
        id: family.id,
        label: trimmed,
        sortOrder,
        isActive,
        ...(editable ? { prefix, padTo } : {}),
      });
      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      fireToast({
        message:
          res.propagatedCounters > 0
            ? `${trimmed} saved — ${res.propagatedCounters} open register(s) re-based.`
            : `${trimmed} saved.`,
      });
      router.refresh();
    });
  }

  /** Current "next number" for whichever counter `target` points at. */
  function targetCurrentNext(): number | null {
    if (!target) return null;
    if (target.kind === "sequence") return family.sequence?.nextValue ?? null;
    return family.counters.find((c) => c.fyLabel === target.fyLabel)?.nextValue ?? null;
  }

  const parsedCounter = Number(counterValue);
  const counterCurrent = targetCurrentNext();
  const counterValid =
    Number.isInteger(parsedCounter) &&
    parsedCounter >= 1 &&
    parsedCounter <= MAX_COUNTER;
  const skipped =
    counterValid && counterCurrent !== null ? parsedCounter - counterCurrent : 0;
  const counterForward = counterCurrent !== null && counterValid && skipped > 0;

  function beginCounterEdit(next: CounterTarget, currentNext: number | null) {
    setTarget(next);
    setCounterValue(currentNext !== null ? String(currentNext) : "");
    setCounterError(null);
    setConfirming(false);
  }

  function cancelCounterEdit() {
    setTarget(null);
    setCounterValue("");
    setCounterError(null);
    setConfirming(false);
  }

  function commitCounter() {
    if (!target || !counterForward) return;
    const t = target;
    setCounterError(null);
    startSaveCounter(async () => {
      const res =
        t.kind === "sequence"
          ? await setSequenceNextValue({
              seriesKey: family.seriesKey,
              nextValue: parsedCounter,
            })
          : await setFySeriesNextValue({
              seriesKey: family.seriesKey,
              fyLabel: t.fyLabel,
              nextValue: parsedCounter,
            });
      if (!res.ok) {
        setCounterError(res.error);
        setConfirming(false);
        return;
      }
      fireToast({
        message: `Next number is now ${res.formatted} — ${res.skipped} number(s) skipped.`,
      });
      cancelCounterEdit();
      router.refresh();
    });
  }

  function openYear(fyLabel: string) {
    startOpenFy(async () => {
      const res = await openFinancialYearCounter({
        seriesKey: family.seriesKey,
        fyLabel,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `${fyLabel} opened — first number will be ${res.formatted}.` });
      router.refresh();
    });
  }

  const openYears = new Set(family.counters.map((c) => c.fyLabel));
  const openableYears = [currentFy, nextFy].filter(
    (y): y is string => typeof y === "string" && !openYears.has(y),
  );

  return (
    <Dialog.Root
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/35" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-section border border-hairline bg-surface-card p-0 shadow-lg max-h-[calc(100dvh-40px)]">
          <div className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-5">
            <div className="min-w-0">
              <Dialog.Title className="text-[19px] font-extrabold leading-tight tracking-tight text-[#1e2f66]">
                {family.label}
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-subtle">
                <span className="font-mono">{family.seriesKey}</span>
                <span aria-hidden="true">·</span>
                <span>{moduleLabel(family.module)}</span>
                <span aria-hidden="true">·</span>
                <span className="truncate">{family.source}</span>
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="shrink-0 rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-6 px-6 py-5">
            {/* ── Register entry ─────────────────────────────────────── */}
            <section aria-labelledby="numbering-format-heading">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3
                  id="numbering-format-heading"
                  className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-ink-subtle"
                >
                  Register entry
                </h3>
                <StrategyBadge strategy={family.strategy} />
              </div>
              <p className="mb-4 text-[13px] leading-relaxed text-ink-muted">
                {STRATEGY_BLURB[family.strategy]}
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="numbering-label"
                    className="mb-1.5 block text-[13px] font-bold text-ink-strong"
                  >
                    Label
                  </label>
                  <input
                    id="numbering-label"
                    value={label}
                    maxLength={60}
                    onChange={(e) => setLabel(e.target.value)}
                    className="nt-input w-full"
                  />
                </div>
                <div>
                  <label
                    htmlFor="numbering-sort"
                    className="mb-1.5 block text-[13px] font-bold text-ink-strong"
                  >
                    Sort order
                  </label>
                  <input
                    id="numbering-sort"
                    type="number"
                    min={0}
                    max={9999}
                    value={sortOrder}
                    onChange={(e) => setSortOrder(Number(e.target.value))}
                    className="nt-input w-full tabular-nums"
                  />
                </div>
                <div>
                  <label
                    htmlFor="numbering-prefix"
                    className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold text-ink-strong"
                  >
                    Prefix
                    {!editable && (
                      <Lock size={12} strokeWidth={2.4} className="text-ink-subtle" />
                    )}
                  </label>
                  <input
                    id="numbering-prefix"
                    value={prefix}
                    maxLength={12}
                    readOnly={!editable}
                    aria-readonly={!editable}
                    onChange={(e) => setPrefix(e.target.value)}
                    className="nt-input w-full font-mono"
                    style={!editable ? { opacity: 0.65 } : undefined}
                  />
                </div>
                <div>
                  <label
                    htmlFor="numbering-pad"
                    className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold text-ink-strong"
                  >
                    Zero padding
                    {!editable && (
                      <Lock size={12} strokeWidth={2.4} className="text-ink-subtle" />
                    )}
                  </label>
                  <input
                    id="numbering-pad"
                    type="number"
                    min={0}
                    max={8}
                    value={padTo}
                    readOnly={!editable}
                    aria-readonly={!editable}
                    onChange={(e) => setPadTo(Number(e.target.value))}
                    className="nt-input w-full tabular-nums"
                    style={!editable ? { opacity: 0.65 } : undefined}
                  />
                </div>
              </div>

              {!editable && (
                <CodeOwnedNote>
                  Prefix and padding for this family are baked into{" "}
                  {family.strategy === "sequence"
                    ? "the column default in db/schema.ts"
                    : "the server action that inserts the row"}
                  , so they are shown here for reference and cannot be changed from
                  the admin. Changing them means a code change plus a migration.
                </CodeOwnedNote>
              )}
              {editable && (
                <CodeOwnedNote>
                  Saving a new prefix or padding also re-bases the open registers for{" "}
                  {currentFy} and later. Closed years keep the format their documents
                  were issued under.
                </CodeOwnedNote>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-chip border border-hairline bg-surface-soft px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                    Next number
                  </span>
                  <PreviewPill value={livePreview} size="lg" live />
                </div>
                <label className="flex cursor-pointer select-none items-center gap-2 text-[13px] font-semibold text-ink-soft">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-brand)]"
                  />
                  Listed in the register
                </label>
              </div>

              {formError && (
                <AdminInlineError className="mt-3">{formError}</AdminInlineError>
              )}

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={saveFormat}
                  disabled={savingForm || !formDirty}
                  className="inline-flex items-center gap-2 rounded-chip px-5 py-2.5 text-[14px] font-semibold text-white transition-opacity disabled:opacity-50"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
                  }}
                >
                  {savingForm && (
                    <Loader2
                      size={14}
                      style={{ animation: "spinFast 0.8s linear infinite" }}
                    />
                  )}
                  Save register entry
                </button>
              </div>
            </section>

            {/* ── Counters ───────────────────────────────────────────── */}
            <section aria-labelledby="numbering-counter-heading">
              <h3
                id="numbering-counter-heading"
                className="mb-3 text-[11.5px] font-bold uppercase tracking-[0.14em] text-ink-subtle"
              >
                {family.strategy === "fy_series"
                  ? "Financial-year registers"
                  : family.strategy === "sequence"
                    ? "Live counter"
                    : "Counter"}
              </h3>

              {family.strategy === "sm_suffix" && (
                <p className="rounded-chip border border-hairline bg-surface-soft px-4 py-3 text-[13px] leading-relaxed text-ink-muted">
                  This family has no counter to edit. Each number is{" "}
                  <span className="font-mono font-semibold text-ink-strong">
                    {sampleSmNumber}-{family.prefix}
                    {"01"}
                  </span>{" "}
                  — the parent SM number plus a two-digit sibling index assigned when
                  the row is inserted.{" "}
                  {family.issuedCount !== null && (
                    <>
                      <span className="tabular-nums font-semibold">
                        {family.issuedCount}
                      </span>{" "}
                      issued so far.
                    </>
                  )}
                </p>
              )}

              {family.strategy === "sequence" && (
                <div className="rounded-chip border border-hairline">
                  {family.sequence?.exists ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="font-mono text-[12.5px] text-ink-subtle">
                          {family.sequence.sequenceName}
                        </p>
                        <p className="mt-1 text-[13px] text-ink-muted tabular-nums">
                          Last value{" "}
                          <span className="font-semibold text-ink-strong">
                            {family.sequence.lastValue ?? "—"}
                          </span>{" "}
                          · next{" "}
                          <span className="font-semibold text-ink-strong">
                            {family.sequence.nextValue ?? "—"}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          beginCounterEdit(
                            { kind: "sequence" },
                            family.sequence?.nextValue ?? null,
                          )
                        }
                        className="rounded-chip border border-hairline-strong px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:border-brand/40 hover:text-ink-strong"
                      >
                        Set next number
                      </button>
                    </div>
                  ) : (
                    <p className="px-4 py-3 text-[13px] text-ink-muted">
                      The sequence{" "}
                      <span className="font-mono">{family.sequenceName ?? "—"}</span> is
                      not present in this database. Run the migrations, then reload.
                    </p>
                  )}
                </div>
              )}

              {family.strategy === "fy_series" && (
                <div className="overflow-hidden rounded-chip border border-hairline">
                  {family.counters.length === 0 ? (
                    <p className="px-4 py-5 text-[13px] leading-relaxed text-ink-muted">
                      No register is open yet. The first document of the year opens one
                      automatically — open it here first if you want it to pick up the
                      prefix and padding above.
                    </p>
                  ) : (
                    <table className="w-full text-[13.5px]">
                      <thead>
                        <tr className="border-b border-hairline bg-surface-soft text-left text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                          <th className="px-4 py-2.5">Financial year</th>
                          <th className="px-4 py-2.5 tabular-nums">Issued</th>
                          <th className="px-4 py-2.5">Next number</th>
                          <th className="px-4 py-2.5 text-right">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {family.counters.map((c) => (
                          <tr
                            key={c.fyLabel}
                            className="border-b border-hairline last:border-b-0"
                          >
                            <td className="px-4 py-2.5 font-semibold text-ink-strong tabular-nums">
                              {c.fyLabel}
                              {c.isCurrentFy && (
                                <span className="ml-2 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em]"
                                  style={{
                                    background: "var(--color-green-bg)",
                                    color: "var(--color-green-deep)",
                                  }}
                                >
                                  Current
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 tabular-nums text-ink-soft">
                              {c.lastValue}
                            </td>
                            <td className="px-4 py-2.5">
                              <PreviewPill value={c.nextFormatted} />
                              {c.driftsFromFormat && (
                                <span
                                  className="ml-2 inline-flex items-center gap-1 text-[11.5px] font-semibold"
                                  title="This year was opened with a different prefix or padding to the register entry above."
                                >
                                  <AlertTriangle
                                    size={12}
                                    strokeWidth={2.4}
                                    style={{ color: "var(--color-amber-deep)" }}
                                  />
                                  <span style={{ color: "var(--color-amber-deep)" }}>
                                    differs
                                  </span>
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => beginCounterEdit({ kind: "fy", fyLabel: c.fyLabel }, c.nextValue)}
                                className="rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong"
                              >
                                Set next
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {family.strategy === "fy_series" && openableYears.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {openableYears.map((y) => (
                    <button
                      key={y}
                      type="button"
                      disabled={openingFy}
                      onClick={() => openYear(y)}
                      className="inline-flex items-center gap-1.5 rounded-chip border border-hairline-strong px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:border-brand/40 hover:text-ink-strong disabled:opacity-50"
                    >
                      <CalendarPlus size={13} strokeWidth={2.3} />
                      Open {y} register
                    </button>
                  ))}
                </div>
              )}

              {/* Forward-only editor + explicit confirm step. */}
              {target && (
                <div className="mt-4 rounded-chip border border-hairline bg-surface-soft p-4">
                  <label
                    htmlFor="numbering-next-value"
                    className="mb-1.5 block text-[13px] font-bold text-ink-strong"
                  >
                    Next number for{" "}
                    {target.kind === "fy" ? target.fyLabel : family.label}
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      id="numbering-next-value"
                      type="number"
                      min={1}
                      max={MAX_COUNTER}
                      value={counterValue}
                      disabled={confirming || savingCounter}
                      onChange={(e) => setCounterValue(e.target.value)}
                      className="nt-input w-40 tabular-nums font-mono"
                    />
                    <span className="text-[13px] text-ink-muted tabular-nums">
                      currently{" "}
                      <span className="font-semibold text-ink-strong">
                        {counterCurrent ?? "—"}
                      </span>
                    </span>
                  </div>

                  <p className="mt-2 text-[12.5px] leading-snug text-ink-subtle">
                    Counters move forward only — every number up to the current value is
                    already printed on a document. Skipped numbers are never reissued.
                  </p>

                  {counterValid && counterCurrent !== null && skipped < 0 && (
                    <AdminInlineError className="mt-3">
                      {parsedCounter} is behind the current value ({counterCurrent}).
                      Choose a higher number.
                    </AdminInlineError>
                  )}
                  {counterValid && counterCurrent !== null && skipped === 0 && (
                    <p className="mt-3 text-[13px] font-semibold text-ink-subtle">
                      That is already the next number.
                    </p>
                  )}
                  {!counterValid && counterValue !== "" && (
                    <AdminInlineError className="mt-3">
                      Enter a whole number between 1 and {MAX_COUNTER.toLocaleString()}.
                    </AdminInlineError>
                  )}
                  {counterError && (
                    <AdminInlineError className="mt-3">{counterError}</AdminInlineError>
                  )}

                  {confirming ? (
                    <div
                      className="mt-3 rounded-chip border px-3.5 py-3"
                      style={{
                        borderColor: "color-mix(in srgb, var(--color-amber) 45%, transparent)",
                        background: "var(--color-amber-bg)",
                      }}
                    >
                      <p className="text-[13px] font-semibold" style={{ color: "var(--color-amber-deep)" }}>
                        This skips {skipped} number{skipped === 1 ? "" : "s"} and cannot be
                        undone.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          ref={confirmRef}
                          type="button"
                          onClick={commitCounter}
                          disabled={savingCounter}
                          className="inline-flex items-center gap-2 rounded-chip px-4 py-2 text-[13px] font-bold text-white transition-opacity disabled:opacity-50"
                          style={{ background: "#D32F2F" }}
                        >
                          {savingCounter && (
                            <Loader2
                              size={13}
                              style={{ animation: "spinFast 0.8s linear infinite" }}
                            />
                          )}
                          Yes, skip {skipped}
                        </button>
                        <button
                          type="button"
                          disabled={savingCounter}
                          onClick={() => setConfirming(false)}
                          className="rounded-chip border border-hairline-strong px-4 py-2 text-[13px] font-semibold text-ink-soft disabled:opacity-50"
                        >
                          Back
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={!counterForward}
                        onClick={() => setConfirming(true)}
                        className="rounded-chip px-4 py-2 text-[13px] font-bold text-white transition-opacity disabled:opacity-50"
                        style={{
                          background:
                            "linear-gradient(135deg, var(--color-brand), var(--color-brand-deep))",
                        }}
                      >
                        Review change
                      </button>
                      <button
                        type="button"
                        onClick={cancelCounterEdit}
                        className="rounded-chip border border-hairline-strong px-4 py-2 text-[13px] font-semibold text-ink-soft"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
