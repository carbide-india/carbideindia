/**
 * Workflow Control — the description layer for the ERP Phase 8 enforced-workflow
 * gates stored on `org_settings.workflow_flags`.
 *
 * Pure + dependency-free (no DB, no server-only) so the admin page (server) and
 * its toggle UI (client) read the SAME catalogue. Nothing here decides
 * behaviour: `lib/workflow/transitions.ts` stays the single source of truth for
 * the edges + guards, and `lib/workflow/flags.ts` stays the single place a flag
 * is defaulted OFF (absent === false === pre-Phase-8 behaviour). This file only
 * explains, in an admin's language, what flipping a gate changes — and records
 * which gates the app actually reads today, so nobody is invited to flip an
 * inert switch and assume the pipeline is now enforced.
 */
import {
  WORKFLOW_FLAG_KEYS,
  WORKFLOW_FLAG_LABELS,
  type WorkflowFlagKey,
} from "@/db/enums";
import {
  actorRoleFor,
  guardsFor,
  type ActorRole,
  type PipelineStage,
} from "@/lib/workflow/transitions";
import { PIPELINE_STAGE_LABELS } from "@/lib/flow/derive-stage";

/**
 * How much of the enforcement path is actually mounted in the app:
 *  - `live`     — advanceStage + the in-app CTA + any redirect guards all exist.
 *  - `partial`  — the server funnel exists but the CTA that drives it is not
 *                 mounted yet, so turning the gate ON removes a path without
 *                 offering its replacement.
 *  - `reserved` — no code reads this key; flipping it is an audited no-op.
 */
export type GateWiring = "live" | "partial" | "reserved";

export interface WorkflowGateSpec {
  key: WorkflowFlagKey;
  label: string;
  /** The pipeline edge this gate governs (`to: null` ⇒ terminal stage). */
  from: PipelineStage;
  to: PipelineStage | null;
  /** What the guarded move is called in the UI once the gate is ON. */
  actionLabel: string;
  wiring: GateWiring;
  /** Why the wiring is less than `live` (rendered as a warning). */
  wiringNote?: string;
  /** Plain-language consequences of switching the gate ON. */
  effectsOn: string[];
  /** What stays true for users while the gate is OFF. */
  behaviourOff: string;
  /** Standalone New forms that stop being reachable while the gate is ON. */
  blockedForms: string[];
  /** Legal-snapshot (freeze) columns the guarded move writes. */
  freezes: string[];
  /** Draft the guarded move auto-provisions by reference, if any. */
  provisions: string | null;
}

/**
 * THE GATES, in pipeline order. Keyed by the compile-time WORKFLOW_FLAG_KEYS
 * union so a key added to `db/enums.ts` fails the type-check here until it is
 * described — an undescribed gate must never render as a bare switch.
 */
const GATE_SPECS: Record<WorkflowFlagKey, WorkflowGateSpec> = {
  quotation: {
    key: "quotation",
    label: WORKFLOW_FLAG_LABELS.quotation,
    from: "quotation",
    to: "negotiation",
    actionLabel: "Send quotation",
    wiring: "partial",
    wiringNote:
      "The server funnel and the New-Negotiation redirect are wired, but no “Send quotation” button is mounted on the quotation detail page yet. With this gate ON, staff can still tick “Quote Sent” on the quotation form — which does NOT freeze prices and does NOT create the negotiation — while the New Negotiation form is blocked, leaving no in-app way to open the negotiation. Turn this on only together with that button.",
    effectsOn: [
      "Sending a quotation runs through the single enforced funnel: it freezes every line’s unit price and spec snapshot, flips Quote Sent, and auto-creates the matching draft negotiation by reference.",
      "The standalone New Negotiation form stops being reachable — /negotiations/new redirects to the negotiations register, because the negotiation is now provisioned for staff.",
      "Only a Sales actor can perform the move, and it is refused outright unless every condition below is met.",
    ],
    behaviourOff:
      "Quotations behave exactly as they do today: “Quote Sent” is a plain checkbox on the quotation form, no price is frozen, and negotiations are opened by hand from New Negotiation.",
    blockedForms: ["/negotiations/new → /negotiations"],
    freezes: [
      "quotation_items.unit_price",
      "quotation_items.spec_snapshot",
      "quotation_items.frozen_at / frozen_by",
    ],
    provisions: "A draft negotiation (idempotent — a second send never duplicates it)",
  },
  negotiation: {
    key: "negotiation",
    label: WORKFLOW_FLAG_LABELS.negotiation,
    from: "negotiation",
    to: "sales_order",
    actionLabel: "Mark order won",
    wiring: "live",
    effectsOn: [
      "A “Mark order won” button appears on the negotiation detail page — it is hidden entirely while the gate is OFF.",
      "Winning the order freezes each line’s agreed price, sets the negotiation to Order Won, and auto-creates the draft sales order by reference.",
      "The standalone New Sales Order form stops being reachable — /sales-orders/new redirects to the sales-orders register.",
    ],
    behaviourOff:
      "Negotiation status stays a free-set dropdown, no agreed price is frozen, and sales orders are opened by hand from New Sales Order.",
    blockedForms: ["/sales-orders/new → /sales-orders"],
    freezes: [
      "negotiation_items.unit_price",
      "negotiation_items.spec_snapshot",
      "negotiation_items.frozen_at / frozen_by",
    ],
    provisions: "A draft sales order (idempotent)",
  },
  sales_order: {
    key: "sales_order",
    label: WORKFLOW_FLAG_LABELS.sales_order,
    from: "sales_order",
    to: "job_card",
    actionLabel: "Confirm order",
    wiring: "live",
    effectsOn: [
      "A “Confirm order” button appears on the sales order detail page — hidden while the gate is OFF.",
      "Confirming freezes unit price, ordered quantity and spec snapshot on every line: from that point the order is a contract and those columns stop tracking edits upstream.",
      "No job card is created by this move — job card release remains its own path, so nothing on the shop floor is blocked by this gate.",
    ],
    behaviourOff:
      "Sales orders stay fully editable through the normal form, and nothing is frozen when the customer confirms.",
    blockedForms: [],
    freezes: [
      "sales_order_items.unit_price",
      "sales_order_items.qty_ordered",
      "sales_order_items.spec_snapshot",
      "sales_order_items.frozen_at / frozen_by",
    ],
    provisions: null,
  },
  job_card: {
    key: "job_card",
    label: WORKFLOW_FLAG_LABELS.job_card,
    from: "job_card",
    to: "production",
    actionLabel: "Release job card",
    wiring: "reserved",
    wiringNote:
      "No code reads this key yet — the enforced funnel covers Quotation, Negotiation and Sales Order only. Flipping it writes an audit entry and changes nothing for users.",
    effectsOn: [
      "Reserved for Phase 9: releasing a job card would become the only way to move work into Production, with the release check enforced server-side.",
    ],
    behaviourOff:
      "Job cards are created, released and progressed through their own screens exactly as today.",
    blockedForms: [],
    freezes: [],
    provisions: null,
  },
  production: {
    key: "production",
    label: WORKFLOW_FLAG_LABELS.production,
    from: "production",
    to: "dispatch",
    actionLabel: "Pass QC",
    wiring: "reserved",
    wiringNote:
      "No code reads this key yet. Flipping it writes an audit entry and changes nothing for users.",
    effectsOn: [
      "Reserved for Phase 9: a QC pass would become the only way to hand a batch to Dispatch, and the QC actor would be enforced server-side.",
    ],
    behaviourOff:
      "Production and QC screens keep their own status controls, with no cross-stage enforcement.",
    blockedForms: [],
    freezes: [],
    provisions: null,
  },
  dispatch: {
    key: "dispatch",
    label: WORKFLOW_FLAG_LABELS.dispatch,
    from: "dispatch",
    to: "invoice",
    actionLabel: "Dispatch goods",
    wiring: "reserved",
    wiringNote:
      "No code reads this key yet. Flipping it writes an audit entry and changes nothing for users.",
    effectsOn: [
      "Reserved for Phase 9: invoicing would be refused until the goods are recorded as dispatched.",
    ],
    behaviourOff:
      "Dispatch notes and invoices are raised independently, in any order.",
    blockedForms: [],
    freezes: [],
    provisions: null,
  },
  invoice: {
    key: "invoice",
    label: WORKFLOW_FLAG_LABELS.invoice,
    from: "invoice",
    to: null,
    actionLabel: "Close the order",
    wiring: "reserved",
    wiringNote:
      "No code reads this key yet, and Invoice is the terminal stage — closing is a status write, not a pipeline move. Flipping it writes an audit entry and changes nothing for users.",
    effectsOn: [
      "Reserved for Phase 9: closing a paid invoice would be restricted to the Accounts actor.",
    ],
    behaviourOff:
      "Invoices are raised and settled through the invoicing screens with no extra gate.",
    blockedForms: [],
    freezes: [],
    provisions: null,
  },
};

/** Every gate, in pipeline order (the WORKFLOW_FLAG_KEYS order). */
export const WORKFLOW_GATES: WorkflowGateSpec[] = WORKFLOW_FLAG_KEYS.map(
  (k) => GATE_SPECS[k],
);

/** Look one gate up by key (undefined for an orphan key found in the jsonb). */
export function gateSpecFor(key: string): WorkflowGateSpec | undefined {
  return (WORKFLOW_FLAG_KEYS as readonly string[]).includes(key)
    ? GATE_SPECS[key as WorkflowFlagKey]
    : undefined;
}

/**
 * The conditions the server enforces before the guarded move is allowed, read
 * straight out of the transition table: evaluating the exit guard against an
 * EMPTY context makes every atom fail closed, so the unmet reasons it returns
 * are exactly the full condition list. Derived, never re-typed, so the page can
 * never drift from `lib/workflow/transitions.ts`.
 */
export function gateConditions(spec: WorkflowGateSpec): string[] {
  if (spec.to === null) return [];
  return guardsFor(spec.from, spec.to, {}).unmet;
}

/** The actor role the transition table requires for the guarded move. */
export function gateActorRole(spec: WorkflowGateSpec): ActorRole {
  return spec.to === null
    ? actorRoleFor(spec.from, spec.from)
    : actorRoleFor(spec.from, spec.to);
}

/** Human label for a pipeline stage (re-exported so the UI needs one import). */
export function stageLabel(stage: PipelineStage): string {
  return PIPELINE_STAGE_LABELS[stage];
}

// ── The sales pipeline as an admin reads it ──────────────────────────────────

/**
 * The chain rendered on the page: the sales flow Manan describes (Client KYC →
 * … → Sales Order) followed by the fulfilment stages the reserved gates cover.
 * `gateAfter` names the gate that governs the move OUT of this node; `null`
 * means that hand-off is not gated at all and keeps its ordinary status UI.
 */
export interface ChainNode {
  id: string;
  label: string;
  /** Short note on what this stage is, shown under the label. */
  hint: string;
  /** Gate governing the exit from this node, if any. */
  gateAfter: WorkflowFlagKey | null;
  /** `sales` = Manan's sales pipeline; `fulfilment` = shop floor and after. */
  band: "sales" | "fulfilment";
}

export const WORKFLOW_CHAIN: ChainNode[] = [
  { id: "kyc", label: "Client KYC", hint: "Form 01 · client onboarding", gateAfter: null, band: "sales" },
  { id: "sample", label: "Sample Register", hint: "Form 02 · physical sample logged", gateAfter: null, band: "sales" },
  { id: "enquiry", label: "New Enquiry", hint: "Form 03 · SM number issued", gateAfter: null, band: "sales" },
  { id: "primary_feasibility", label: "Primary Feasibility", hint: "5-check checklist", gateAfter: null, band: "sales" },
  { id: "secondary_feasibility", label: "Secondary Feasibility", hint: "Product-level feasibility", gateAfter: null, band: "sales" },
  { id: "costing", label: "Costing", hint: "In-house / bought-out sheets", gateAfter: null, band: "sales" },
  { id: "quotation", label: "Quotation", hint: "Priced offer to the customer", gateAfter: "quotation", band: "sales" },
  { id: "negotiation", label: "Negotiation", hint: "Won / lost against the quote", gateAfter: "negotiation", band: "sales" },
  { id: "sales_order", label: "Sales Order", hint: "Customer PO accepted", gateAfter: "sales_order", band: "sales" },
  { id: "job_card", label: "Job Card", hint: "Work released to the floor", gateAfter: "job_card", band: "fulfilment" },
  { id: "production", label: "Production", hint: "Manufacture + QC", gateAfter: "production", band: "fulfilment" },
  { id: "dispatch", label: "Dispatch", hint: "Goods leave the plant", gateAfter: "dispatch", band: "fulfilment" },
  { id: "invoice", label: "Invoice", hint: "Billed and settled", gateAfter: "invoice", band: "fulfilment" },
];

/** Normalise the raw jsonb map into a complete, boolean-valued gate state. */
export function normaliseGateFlags(
  raw: Record<string, boolean> | null | undefined,
): Record<WorkflowFlagKey, boolean> {
  const out = {} as Record<WorkflowFlagKey, boolean>;
  for (const k of WORKFLOW_FLAG_KEYS) out[k] = raw?.[k] === true;
  return out;
}

export { WORKFLOW_FLAG_KEYS, type WorkflowFlagKey };
