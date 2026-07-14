"use client";

import { useMemo, useState, useTransition } from "react";
import { Scale, MapPin, Landmark } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { updateOrgSettings } from "@/app/(admin)/admin/settings/actions";
import type { OrgSettings } from "@/db/schema";

/** All Company & Legal fields, grouped into cards. */
const FIELDS = [
  { key: "legalName", label: "Legal Name", placeholder: "Yogeshwar Engineering Pvt Ltd", group: "entity", full: true },
  { key: "gstin", label: "GSTIN", placeholder: "27AAACX0000X1ZX", group: "entity" },
  { key: "panNo", label: "PAN", placeholder: "AAACX0000X", group: "entity" },
  { key: "cin", label: "CIN", placeholder: "U12345MH2000PTC000000", group: "entity" },
  { key: "regAddress", label: "Registered Address", placeholder: "W-150(A) MIDC Ambad", group: "address", full: true },
  { key: "regCity", label: "City", placeholder: "Nashik", group: "address" },
  { key: "regState", label: "State", placeholder: "Maharashtra", group: "address" },
  { key: "regPincode", label: "Pincode", placeholder: "422010", group: "address" },
  { key: "bankName", label: "Bank Name", placeholder: "HDFC Bank", group: "bank" },
  { key: "bankAccountNo", label: "Account No", placeholder: "50200000000000", group: "bank" },
  { key: "bankIfsc", label: "IFSC", placeholder: "HDFC0000000", group: "bank" },
  { key: "bankBranch", label: "Branch", placeholder: "Ambad, Nashik", group: "bank" },
] as const;

type LegalKey = (typeof FIELDS)[number]["key"];

const GROUPS = [
  { id: "entity", title: "Legal Entity", hint: "Shown on quotations, invoices and official documents.", Icon: Scale },
  { id: "address", title: "Registered Address", hint: "The company's registered office.", Icon: MapPin },
  { id: "bank", title: "Bank Details", hint: "Printed on quotations / invoices for payment.", Icon: Landmark },
] as const;

export function SettingsTabLegal({ current }: { current: OrgSettings }) {
  const initial = useMemo(() => {
    const m = {} as Record<LegalKey, string>;
    for (const f of FIELDS) m[f.key] = (current[f.key] as string | null) ?? "";
    return m;
  }, [current]);

  const [values, setValues] = useState<Record<LegalKey, string>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = FIELDS.some((f) => values[f.key].trim() !== initial[f.key]);

  function set(key: LegalKey, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const patch: Partial<Record<LegalKey, string>> = {};
    for (const f of FIELDS) {
      const next = values[f.key].trim();
      if (next !== initial[f.key]) patch[f.key] = next;
    }
    if (Object.keys(patch).length === 0) {
      setError("No changes to save.");
      return;
    }
    startTransition(async () => {
      const res = await updateOrgSettings(patch);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      fireToast({ message: "Company & Legal saved." });
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {GROUPS.map((g) => (
        <section
          key={g.id}
          className="rounded-2xl border border-[#e6e8ec] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
        >
          <div className="mb-4 flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-[#eef1fb] text-[#3f3f94]">
              <g.Icon className="h-[18px] w-[18px]" />
            </span>
            <div>
              <h3 className="text-[15px] font-extrabold text-[#1e2f66]">{g.title}</h3>
              <p className="text-[12.5px] text-[#6b7280]">{g.hint}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            {FIELDS.filter((f) => f.group === g.id).map((f) => (
              <label
                key={f.key}
                className={`flex flex-col gap-1.5 ${"full" in f && f.full ? "col-span-2 max-md:col-span-1" : ""}`}
              >
                <span className="text-[12.5px] font-bold text-[#3a4152]">{f.label}</span>
                <input
                  type="text"
                  value={values[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="h-[42px] rounded-lg border border-[#dfe1e6] bg-white px-3.5 text-[14px] text-[#1f2430] outline-none transition placeholder:text-[#adb2bd] focus:border-[#3f3f94] focus:ring-2 focus:ring-[#3f3f94]/15"
                />
              </label>
            ))}
          </div>
        </section>
      ))}

      {error && (
        <p className="text-[13px] font-semibold text-[#d32f2f]">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !dirty}
          className="inline-flex h-[44px] items-center gap-2 rounded-lg bg-[#3f3f94] px-6 text-[14px] font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#2f2f6f] hover:shadow-[0_8px_20px_rgba(63,63,148,0.28)] disabled:translate-y-0 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save Company & Legal"}
        </button>
        {dirty && !pending && (
          <button
            type="button"
            onClick={() => {
              setValues(initial);
              setError(null);
            }}
            className="text-[13px] font-semibold text-[#6b7280] transition hover:text-[#3a4152]"
          >
            Discard changes
          </button>
        )}
      </div>
    </form>
  );
}
