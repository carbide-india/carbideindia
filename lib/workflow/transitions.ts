/**
 * ERP Phase 8 — the SINGLE source of truth for pipeline transitions (§4.6).
 *
 * A pure, declarative table: for each stage, the allowed from→to moves, the
 * `actorRole` required to perform them, and the entry/exit GUARDS (pure
 * predicates over an FK-resolved record context). Both the server enforcement
 * (`advanceStage`) and the RSC rendering read this ONE table, so the UI never
 * offers a transition the server would reject. There is no other place a stage
 * changes.
 *
 * Pure + dependency-free (no DB, no server-only) so it is trivially unit-testable
 * and importable from client OR server.
 */
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/flow/derive-stage";

/** The state-machine actor roles (mirror `lib/auth/roles.ts` / §5). */
export type ActorRole =
  | "sales"
  | "costing"
  | "production"
  | "qc"
  | "dispatch"
  | "accounts"
  | "admin";

/**
 * The FK-resolved context a guard evaluates. Every field is optional so a
 * caller passes only what the transition needs; a guard that references a
 * missing field treats it as unmet (fails closed). Counts express "≥1 such row
 * exists"; the price/spec fields are the transactional facts a freeze depends
 * on. This is deliberately a thin projection — never the whole ORM row.
 */
export interface GuardContext {
  /** Line count with a resolvable unit price (> 0) — for quote→sent. */
  linesWithPrice?: number;
  /** Total active lines on the entity. */
  lineCount?: number;
  /** Line count carrying an `item_id` (not a raw/unlinked line). */
  linesWithItem?: number;
  /** Line count with exactly one chosen, done costing. */
  linesWithChosenCosting?: number;
  /** The parent quotation reached `sent` (for negotiation entry). */
  parentQuoteSent?: boolean;
  /** A quotation was sent for this SM (for negotiation→order_won). */
  hasSentQuotation?: boolean;
  /** Won lines each carry an agreed (frozen-able) price. */
  wonLinesHavePrice?: boolean;
  /** A customer PO / document is attached (for SO→confirmed). */
  hasCustomerPo?: boolean;
  /** Per-line ordered qty present (for SO→confirmed). */
  linesWithQty?: number;
  /** SO is confirmed (for job-card entry / release). */
  soConfirmed?: boolean;
  /** Job card released (for production entry). */
  jobCardReleased?: boolean;
  /** Production QC passed (for dispatch entry). */
  productionPassed?: boolean;
  /** Goods dispatched (for invoice entry). */
  dispatched?: boolean;
}

/** Result of a guard evaluation. `ok` false ⇒ `unmet` lists the failed reasons. */
export interface GuardResult {
  ok: boolean;
  unmet: string[];
}

/** A guard is a pure predicate over the resolved context. */
export type Guard = (ctx: GuardContext) => GuardResult;

const PASS: GuardResult = { ok: true, unmet: [] };

/** Compose guards — all must pass; unmet reasons accumulate. */
function all(...guards: Guard[]): Guard {
  return (ctx) => {
    const unmet: string[] = [];
    for (const g of guards) {
      const r = g(ctx);
      if (!r.ok) unmet.push(...r.unmet);
    }
    return unmet.length ? { ok: false, unmet } : PASS;
  };
}

function guard(predicate: (ctx: GuardContext) => boolean, unmet: string): Guard {
  return (ctx) => (predicate(ctx) ? PASS : { ok: false, unmet: [unmet] });
}

// ── Reusable guard atoms ─────────────────────────────────────────────────────
const hasLines = guard((c) => (c.lineCount ?? 0) > 0, "at least one line is required");
const allLinesHaveItem = guard(
  (c) => (c.lineCount ?? 0) > 0 && (c.linesWithItem ?? 0) >= (c.lineCount ?? 0),
  "every line must be linked to an Item (no unlinked products)",
);
const everyLineHasChosenCosting = guard(
  (c) => (c.lineCount ?? 0) > 0 && (c.linesWithChosenCosting ?? 0) >= (c.lineCount ?? 0),
  "every line needs exactly one chosen, completed costing",
);
const atLeastOnePricedLine = guard(
  (c) => (c.linesWithPrice ?? 0) >= 1,
  "at least one line must have a unit price before sending",
);
const parentQuoteIsSent = guard((c) => c.parentQuoteSent === true, "the parent quotation must be sent");
const quotationWasSent = guard((c) => c.hasSentQuotation === true, "a quotation must have been sent");
const wonLinesPriced = guard((c) => c.wonLinesHavePrice === true, "each won line needs an agreed price");
const customerPoAttached = guard((c) => c.hasCustomerPo === true, "a customer PO must be attached");
const everyLineHasQty = guard(
  (c) => (c.lineCount ?? 0) > 0 && (c.linesWithQty ?? 0) >= (c.lineCount ?? 0),
  "every line needs an ordered quantity",
);
const soIsConfirmed = guard((c) => c.soConfirmed === true, "the sales order must be confirmed");
const jcIsReleased = guard((c) => c.jobCardReleased === true, "the job card must be released");
const prodPassed = guard((c) => c.productionPassed === true, "production QC must pass");
const goodsDispatched = guard((c) => c.dispatched === true, "goods must be dispatched");

const noGuard: Guard = () => PASS;

/**
 * One transition edge: the target stage, the required actor role, and the exit
 * guard evaluated on the SOURCE record before the move is allowed. The entry
 * guard for the target stage lives on the target stage's spec (below).
 */
export interface TransitionEdge {
  to: PipelineStage;
  actorRole: ActorRole;
  /** Guard on the source record that must pass to LEAVE this stage. */
  exitGuard: Guard;
}

/** Per-stage spec: who owns it, its entry guard, and its outgoing edges. */
export interface StageSpec {
  actorRole: ActorRole;
  /** Guard evaluated when ENTERING this stage (entry gate). */
  entryGuard: Guard;
  /** Outgoing transitions keyed by target stage. */
  edges: TransitionEdge[];
}

/**
 * THE TABLE. Each stage → its actor, entry guard, and allowed forward edges
 * (§4.1 / §4.2). Terminal-branch edges (order_lost / abandoned, invoice paid →
 * closed) are per-status and handled by the status writers, not modeled as
 * stage edges here — this table governs the forward pipeline spine only.
 */
export const STAGE_TRANSITIONS: Record<PipelineStage, StageSpec> = {
  enquiry: {
    actorRole: "sales",
    entryGuard: noGuard,
    edges: [{ to: "feasibility", actorRole: "sales", exitGuard: all(hasLines) }],
  },
  feasibility: {
    actorRole: "costing",
    entryGuard: hasLines,
    edges: [{ to: "costing", actorRole: "costing", exitGuard: all(allLinesHaveItem) }],
  },
  costing: {
    actorRole: "costing",
    entryGuard: allLinesHaveItem,
    edges: [
      { to: "quotation", actorRole: "sales", exitGuard: all(everyLineHasChosenCosting) },
    ],
  },
  quotation: {
    actorRole: "sales",
    entryGuard: everyLineHasChosenCosting,
    edges: [
      // Sending a quote requires ≥1 line with a unit price (§2.4 exit guard).
      { to: "negotiation", actorRole: "sales", exitGuard: all(atLeastOnePricedLine) },
    ],
  },
  negotiation: {
    actorRole: "sales",
    entryGuard: parentQuoteIsSent,
    edges: [
      // order_won → SO requires a sent quotation + priced won lines (§2.5).
      {
        to: "sales_order",
        actorRole: "sales",
        exitGuard: all(quotationWasSent, wonLinesPriced),
      },
    ],
  },
  sales_order: {
    actorRole: "sales",
    entryGuard: quotationWasSent,
    edges: [
      // Confirm → Job Card: PO attached, qty per line (freeze qty_ordered).
      {
        to: "job_card",
        actorRole: "sales",
        exitGuard: all(customerPoAttached, everyLineHasQty),
      },
    ],
  },
  job_card: {
    actorRole: "production",
    entryGuard: soIsConfirmed,
    edges: [{ to: "production", actorRole: "production", exitGuard: all(jcIsReleased) }],
  },
  production: {
    actorRole: "production",
    entryGuard: jcIsReleased,
    edges: [{ to: "dispatch", actorRole: "qc", exitGuard: all(prodPassed) }],
  },
  dispatch: {
    actorRole: "dispatch",
    entryGuard: prodPassed,
    edges: [{ to: "invoice", actorRole: "accounts", exitGuard: all(goodsDispatched) }],
  },
  invoice: {
    actorRole: "accounts",
    entryGuard: goodsDispatched,
    edges: [], // terminal — closed_won is a status write, not a stage edge.
  },
};

// ── Typed helpers ────────────────────────────────────────────────────────────

/** Find the edge from → to, if the transition is defined. */
function edgeFor(from: PipelineStage, to: PipelineStage): TransitionEdge | undefined {
  return STAGE_TRANSITIONS[from].edges.find((e) => e.to === to);
}

/** True iff a from→to edge exists in the table (regardless of guards). */
export function canTransition(from: PipelineStage, to: PipelineStage): boolean {
  return edgeFor(from, to) !== undefined;
}

/**
 * The actor role required for a specific from→to transition (falls back to the
 * source stage's owner role when no such edge is defined — used only for
 * rendering; enforcement always goes through a defined edge).
 */
export function actorRoleFor(from: PipelineStage, to: PipelineStage): ActorRole {
  return edgeFor(from, to)?.actorRole ?? STAGE_TRANSITIONS[from].actorRole;
}

/**
 * The EXIT guard for a from→to transition, evaluated against the resolved
 * context — this is the gate `advanceStage` enforces to LEAVE the source stage
 * (§4.6). If the transition edge is undefined the result is a hard fail. The
 * target's ENTRY guard is a separate, view-from-the-other-side predicate (used
 * for rendering "is the next stage ready"); see {@link entryGuardFor}. They are
 * NOT composed here — the exit guard already carries the forward-motion
 * conditions, and the target record does not yet exist at transition time.
 */
export function guardsFor(
  from: PipelineStage,
  to: PipelineStage,
  ctx: GuardContext,
): GuardResult {
  const edge = edgeFor(from, to);
  if (!edge) {
    return { ok: false, unmet: [`no transition ${from} → ${to} is defined`] };
  }
  return edge.exitGuard(ctx);
}

/** Evaluate a stage's ENTRY guard against the resolved context (for rendering). */
export function entryGuardFor(stage: PipelineStage, ctx: GuardContext): GuardResult {
  return STAGE_TRANSITIONS[stage].entryGuard(ctx);
}

/** The list of stages reachable from a given stage (for UI "next step" CTAs). */
export function nextStagesFrom(from: PipelineStage): PipelineStage[] {
  return STAGE_TRANSITIONS[from].edges.map((e) => e.to);
}

/** Re-export so consumers get the canonical order from one import. */
export { PIPELINE_STAGES };
export type { PipelineStage };
