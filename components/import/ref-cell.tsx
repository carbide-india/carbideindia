"use client";

import * as React from "react";
import { Select } from "@/components/ui/select";
import type { RefOption, RefKind, CreateMasterMarker } from "@/lib/import/engine/spec";

export type RefCellValue = string | CreateMasterMarker | null;

interface Props {
  raw: string;                 // original sheet text (offered as the create-name)
  value: RefCellValue;         // current resolved value
  options: RefOption[];        // lookups for this kind
  kind: RefKind;
  allowCreate: boolean;        // admin + master kind
  onChange: (v: RefCellValue) => void;
}

const CREATE = "__create__";
const BLANK = "__blank__";

/** Editable cell for a reference field: pick an existing option, create a new
 *  master from the raw text (admin only), or leave blank. */
export function RefCell({ raw, value, options, allowCreate, kind, onChange }: Props) {
  const selected =
    typeof value === "string" ? value
    : value && "__createMaster" in value ? CREATE
    : BLANK;

  const opts = [
    { value: BLANK, label: "— leave blank —" },
    ...options.map((o) => ({ value: o.id, label: o.label })),
    ...(allowCreate && raw ? [{ value: CREATE, label: `+ Create "${raw}"` }] : []),
  ];

  return (
    <Select
      value={selected}
      searchable
      ariaLabel="Reference value"
      options={opts}
      onValueChange={(v) => {
        if (v === BLANK) onChange(null);
        else if (v === CREATE) onChange({ __createMaster: { kind, name: raw } });
        else onChange(v);
      }}
    />
  );
}
