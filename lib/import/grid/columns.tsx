"use client";

import * as React from "react";
import type { Column, CellProps } from "react-datasheet-grid";
import type { ImportField, Lookups } from "@/lib/import/engine/spec";
import { resolveCell } from "@/lib/import/engine/resolve";
import { RefCell, type RefCellValue } from "@/components/import/ref-cell";
import type { SheetRow } from "./rows";

/**
 * Maps one `ImportField` onto one react-datasheet-grid column.
 *
 * Every value that enters a cell — typed, pasted, or parsed from an uploaded
 * file — goes through `resolveCell`, so the grid, the Excel upload and the
 * commit share a single validation path. Cells store the engine's `CellResult`,
 * which carries the raw text, the resolved value, the display string and the
 * error, so a bad cell can stay visible and editable instead of being dropped.
 */

interface ColumnData {
  field: ImportField;
  lookups: Lookups;
  isAdmin: boolean;
}

/** Width hints per field type — refs need room for a name, numbers do not. */
function basisFor(field: ImportField): number {
  if (field.type === "number") return 110;
  if (field.type === "boolean") return 110;
  if (field.type === "date") return 140;
  if (field.type === "ref" || field.type === "refMulti") return 200;
  if (field.maxLen && field.maxLen > 200) return 260;
  return 170;
}

/** Plain text/number/date/enum/boolean cell — an input over the display text. */
function TextLikeCell({
  rowData,
  setRowData,
  focus,
  active,
  columnData,
}: CellProps<SheetRow, ColumnData>) {
  const { field, lookups } = columnData;
  const cell = rowData[field.key];
  const ref = React.useRef<HTMLInputElement>(null);
  // The grid owns focus: mirror its `focus` flag onto the real input so
  // keyboard navigation lands the caret where the user expects.
  React.useLayoutEffect(() => {
    if (focus) {
      ref.current?.focus();
      ref.current?.select();
    } else {
      ref.current?.blur();
    }
  }, [focus]);

  const status = cell?.status ?? "empty";
  return (
    <input
      ref={ref}
      className="dsg-carbide-input"
      data-status={status}
      // Only editable while the grid says this cell has focus — otherwise the
      // input would swallow the grid's own key handling.
      readOnly={!focus}
      tabIndex={-1}
      aria-label={field.header}
      title={cell?.error}
      placeholder={active && field.example ? field.example : undefined}
      value={cell?.display ?? ""}
      onChange={(e) => setRowData({ ...rowData, [field.key]: resolveCell(field, e.target.value, lookups) })}
    />
  );
}

/** Master-reference cell — reuses the existing searchable + create-new control. */
function RefSheetCell({
  rowData,
  setRowData,
  focus,
  columnData,
}: CellProps<SheetRow, ColumnData>) {
  const { field, lookups, isAdmin } = columnData;
  const cell = rowData[field.key];
  const options = React.useMemo(
    () => (field.ref ? (lookups[field.ref.kind] ?? []) : []),
    [field, lookups],
  );

  function commit(v: RefCellValue) {
    const display =
      typeof v === "string"
        ? (options.find((o) => o.id === v)?.label ?? "")
        : v
          ? `+ ${v.__createMaster.name}`
          : "";
    const status: "ok" | "empty" | "error" =
      v === null ? (field.required ? "error" : "empty") : "ok";
    setRowData({
      ...rowData,
      [field.key]: {
        raw: display,
        value: v as never,
        display,
        status,
        error: status === "error" ? `${field.header} is required` : undefined,
      },
    });
  }

  if (!field.ref) return <span />;
  return (
    <div className="dsg-carbide-ref" data-status={cell?.status ?? "empty"} data-focus={focus ? "1" : undefined}>
      <RefCell
        raw={cell?.raw ?? ""}
        value={cell?.value as RefCellValue}
        options={options}
        kind={field.ref.kind}
        allowCreate={Boolean(field.ref.allowCreate) && isAdmin}
        onChange={commit}
      />
    </div>
  );
}

/** Build the grid's column list from an import spec's fields. */
export function columnsForFields(
  fields: ImportField[],
  lookups: Lookups,
  isAdmin: boolean,
): Column<SheetRow, ColumnData, string>[] {
  return fields.map((field) => {
    const columnData: ColumnData = { field, lookups, isAdmin };
    const isRef = field.type === "ref" || field.type === "refMulti";
    return {
      id: field.key,
      title: field.required ? `${field.header} *` : field.header,
      basis: basisFor(field),
      grow: 0,
      shrink: 0,
      minWidth: 96,
      columnData,
      component: isRef ? RefSheetCell : TextLikeCell,
      // The ref cell owns a popover, so let it keep focus while open.
      keepFocus: isRef,
      copyValue: ({ rowData }) => rowData[field.key]?.display ?? "",
      // Pasted text is resolved exactly like typed text, so pasting "OEM" into
      // a ref column lands the master's id, not an unmatched string.
      pasteValue: ({ rowData, value }) => ({
        ...rowData,
        [field.key]: resolveCell(field, String(value ?? "").trim(), lookups),
      }),
      deleteValue: ({ rowData }) => ({
        ...rowData,
        [field.key]: resolveCell(field, "", lookups),
      }),
      isCellEmpty: ({ rowData }) => (rowData[field.key]?.raw ?? "") === "",
    };
  });
}
