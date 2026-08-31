import {
  ENQUIRY_STAGE_BUCKETS,
  ENQUIRY_STATUS_LABELS,
  ENQUIRY_STATUS_COLORS,
  FEASIBILITY_STAGE_BUCKETS,
  FEASIBILITY_STATUS_LABELS,
  FEASIBILITY_STATUS_COLORS,
  SECONDARY_FEASIBILITY_STAGE_BUCKETS,
  SECONDARY_FEASIBILITY_STATUS_LABELS,
  SECONDARY_FEASIBILITY_STATUS_COLORS,
  COSTING_STAGE_BUCKETS,
  COSTING_DONE_STATUS_LABELS,
  COSTING_DONE_STATUS_COLORS,
  QUOTATION_STAGE_BUCKETS,
  QUOTATION_STATUS_LABELS,
  QUOTATION_STATUS_COLORS,
  SALES_ORDER_STAGE_BUCKETS,
  SALES_ORDER_STATUS_LABELS,
  SALES_ORDER_STATUS_COLORS,
} from "@/db/enums";

/**
 * The stage boards, described once.
 *
 * Every pipeline stage already owned the four things a Kanban needs — an
 * ordered list of status buckets (the same ones its sidebar counts), labels,
 * tones, and a server action that sets the status behind the approval gate.
 * What was missing was a board, and the Negotiation module had grown a bespoke
 * one while nothing else had any. This registry is what lets ONE board
 * component serve every stage, so the columns on a board can never drift from
 * the buckets in that stage's sidebar: they are literally the same array.
 *
 * Negotiation is deliberately absent. Its board predates this, carries the Lost
 * Reason capture and its own remark thread, and rewriting a working surface to
 * prove a point would be a poor trade. It follows the same rule that matters —
 * a remark is required on every move.
 */

export type BoardModule =
  | "enquiry"
  | "feasibility"
  | "secondary-feasibility"
  | "costing"
  | "quotation"
  | "sales-order";

export interface BoardModuleConfig {
  /** URL segment + the `module` value stored on every remark. */
  key: BoardModule;
  /** Board heading. */
  title: string;
  /** What ONE card is — "enquiry", "product line", "quotation". */
  unit: string;
  /** Column order, left to right. The stage's own bucket list. */
  buckets: readonly string[];
  labels: Record<string, string>;
  tones: Record<string, string>;
  /** Where the board lives, and where its register lives. */
  boardHref: string;
  registerHref: string;
}

const cfg = (c: BoardModuleConfig): BoardModuleConfig => c;

export const BOARD_MODULES: Record<BoardModule, BoardModuleConfig> = {
  enquiry: cfg({
    key: "enquiry",
    title: "Enquiry Kanban",
    unit: "enquiry",
    buckets: ENQUIRY_STAGE_BUCKETS,
    labels: ENQUIRY_STATUS_LABELS,
    tones: ENQUIRY_STATUS_COLORS,
    boardHref: "/enquiries/board",
    registerHref: "/enquiries/register",
  }),
  feasibility: cfg({
    key: "feasibility",
    title: "Primary Feasibility Kanban",
    unit: "enquiry",
    buckets: FEASIBILITY_STAGE_BUCKETS,
    labels: FEASIBILITY_STATUS_LABELS,
    tones: FEASIBILITY_STATUS_COLORS,
    boardHref: "/feasibility/board",
    registerHref: "/feasibility",
  }),
  "secondary-feasibility": cfg({
    key: "secondary-feasibility",
    title: "Secondary Feasibility Kanban",
    unit: "product line",
    buckets: SECONDARY_FEASIBILITY_STAGE_BUCKETS,
    labels: SECONDARY_FEASIBILITY_STATUS_LABELS,
    tones: SECONDARY_FEASIBILITY_STATUS_COLORS,
    boardHref: "/secondary-feasibility/board",
    registerHref: "/secondary-feasibility",
  }),
  costing: cfg({
    key: "costing",
    title: "Costing Kanban",
    unit: "cost sheet",
    buckets: COSTING_STAGE_BUCKETS,
    labels: COSTING_DONE_STATUS_LABELS,
    tones: COSTING_DONE_STATUS_COLORS,
    boardHref: "/costings/board",
    registerHref: "/costings",
  }),
  quotation: cfg({
    key: "quotation",
    title: "Quotation Kanban",
    unit: "quotation",
    buckets: QUOTATION_STAGE_BUCKETS,
    labels: QUOTATION_STATUS_LABELS,
    tones: QUOTATION_STATUS_COLORS,
    boardHref: "/quotations/board",
    registerHref: "/quotations",
  }),
  "sales-order": cfg({
    key: "sales-order",
    title: "Sales Order Kanban",
    unit: "sales order",
    buckets: SALES_ORDER_STAGE_BUCKETS,
    labels: SALES_ORDER_STATUS_LABELS,
    tones: SALES_ORDER_STATUS_COLORS,
    boardHref: "/sales-orders/board",
    registerHref: "/sales-orders",
  }),
};

/** True when `s` is a column on this module's board. */
export function isBoardBucket(module: BoardModule, s: string): boolean {
  return BOARD_MODULES[module].buckets.includes(s);
}

/** One card on a stage board — the shape every module's query must return. */
export interface BoardCard {
  /** The row this card moves: the id the module's status setter expects. */
  id: string;
  /** Headline — SM number, quote no, SO no. */
  title: string;
  /** Second line — usually the company. */
  subtitle: string | null;
  /** Right-aligned fact: a value, a quantity, a date. */
  meta: string | null;
  /** Which column it sits in. */
  bucket: string;
  /** Where the card opens. */
  href: string;
  /** Last movement, for the ageing tint. */
  updatedAt: string | null;
  /** Set when the card cannot move (e.g. a costable line with no sheet yet). */
  lockedReason?: string;
}
