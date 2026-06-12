"use client";

import * as React from "react";
import { Select } from "@/components/ui/select";

interface Props {
  /** The stored value — a preset from `options` or free text typed under
   *  the "Other(s)" choice. */
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  /** The option that reveals the specify input ("Other" / "Others"). */
  otherOption: string;
  specifyPlaceholder: string;
  ariaLabel: string;
  /** Extra classes on the select trigger. */
  className?: string;
}

/**
 * Location picker for the Sample Register: the preset list from db/enums,
 * plus a specify input that appears when "Other(s)" is chosen — the TYPED
 * TEXT is what gets stored (the columns are free text), never the literal
 * "Other". Controlled: `value` is the stored string; internal state only
 * tracks which face the user is on.
 */
export function LocationSelect({
  value,
  onChange,
  options,
  otherOption,
  specifyPlaceholder,
  ariaLabel,
  className,
}: Props) {
  const isPreset = options.includes(value) && value !== otherOption;
  // A non-preset stored value (incl. legacy literal "Other") opens on the
  // specify face with the custom text prefilled.
  const [choice, setChoice] = React.useState<string>(
    isPreset ? value : otherOption,
  );
  const [custom, setCustom] = React.useState<string>(
    options.includes(value) ? "" : value,
  );
  const specifying = choice === otherOption;

  return (
    <div className="flex flex-col gap-2">
      <Select
        value={choice}
        onValueChange={(next) => {
          setChoice(next);
          onChange(next === otherOption ? custom : next);
        }}
        options={options.map((o) => ({ value: o, label: o }))}
        ariaLabel={ariaLabel}
        className={className}
      />
      {specifying && (
        <input
          type="text"
          className="nt-input"
          required
          maxLength={80}
          placeholder={specifyPlaceholder}
          aria-label={`${ariaLabel} — specify`}
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            onChange(e.target.value);
          }}
        />
      )}
    </div>
  );
}
