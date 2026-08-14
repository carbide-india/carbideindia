/**
 * A register's name and count, sized to sit INSIDE the toolbar row.
 *
 * Registers used to spend three stacked rows before any data — a 26px <h1>, a
 * count sub-line, then the search/filter bar — which on a laptop is most of the
 * fold gone before the first record. This puts the name, the count and the
 * active-filter note on the same line as the controls, so the table starts
 * roughly 70px higher on every register.
 *
 * Deliberately smaller than the old <h1>: at 17px it reads as a label on the
 * controls rather than competing with the module name in the sidebar, which
 * already says where you are.
 */
export function RegisterHeading({
  title,
  count,
  unit,
  filterLabel,
}: {
  title: string;
  /** Rows currently listed. */
  count: number;
  /** What one row IS — "enquiry", "line", "quotation". Always say it: the
   *  register's unit and the stage's unit are not always the same thing. */
  unit: string;
  /** Names the active filter, so a filtered register is never mistaken for an
   *  empty one. */
  filterLabel?: string | null;
}) {
  return (
    <>
      <h1 className="whitespace-nowrap text-[17px] font-black leading-none tracking-tight text-[#3f3f94]">
        {title}
      </h1>
      <span className="whitespace-nowrap text-[12.5px] font-semibold tabular-nums text-[#6b7280]">
        {count} {count === 1 ? unit : `${unit}s`}
        {filterLabel ? (
          <span className="ml-1.5 font-bold text-ink-soft">· {filterLabel}</span>
        ) : null}
      </span>
    </>
  );
}
