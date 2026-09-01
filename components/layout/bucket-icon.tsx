import {
  AlarmClock,
  Ban,
  Circle,
  CircleCheck,
  CircleHelp,
  CircleX,
  ClipboardList,
  Clock3,
  GitCompareArrows,
  Handshake,
  PauseCircle,
  PencilLine,
  SendHorizonal,
  Undo2,
} from "lucide-react";

/**
 * One icon per house bucket, shared by every module sidebar.
 *
 * The house vocabulary is the same at every stage (Not Started → Draft → Need
 * Info → Pending Approval → <Stage> Approved, plus Not Approved and, where a
 * stage can genuinely reject, Not Feasible). Manan's whole point is that no
 * stage should make you re-learn it — which only holds if one map draws them
 * all, so Costing's "Pending Approval" is the same glyph as Feasibility's.
 *
 * Split into a pure `normalizeBucketKey` (string → string) plus a constant
 * record, rather than one `iconFor(key)` helper: a function that RETURNS a
 * component and is called during render trips the react-compiler's
 * "Cannot create components during render" rule, even when it is only ever a
 * lookup. Indexing a frozen record is the same thing without the false alarm.
 */

export type BucketIcon = typeof Circle;

/** The canonical bucket names the icon map is keyed by. */
export type BucketIconKey =
  | "not_started"
  | "draft"
  | "need_info"
  | "pending_approval"
  | "approved"
  | "not_approved"
  | "not_feasible"
  | "on_hold"
  | "cancelled"
  | "all"
  | "overdue"
  | "not_sent"
  | "outcome"
  | "variance";

export const BUCKET_ICONS: Record<BucketIconKey, BucketIcon> = {
  not_started: Circle,
  draft: PencilLine,
  need_info: CircleHelp,
  pending_approval: Clock3,
  approved: CircleCheck,
  // Distinct from Not Feasible: "the approver sent it back", not "this cannot
  // be made". Same distinction the rose/red tones carry.
  not_approved: Undo2,
  not_feasible: CircleX,
  // Approver freeze states — the whole inquiry is paused / cancelled.
  on_hold: PauseCircle,
  cancelled: Ban,
  // Cross-cutting views that are not buckets of the queue.
  all: ClipboardList,
  overdue: AlarmClock,
  not_sent: SendHorizonal,
  outcome: Handshake,
  variance: GitCompareArrows,
};

/**
 * Map a stage's OWN status value onto the canonical bucket it represents.
 * Each stage keeps its own enum, and names its final value after itself
 * (`costing_approved`, `quotation_approved`, feasibility's legacy
 * `proceed_to_costing`) — matched by suffix so adding a stage needs no edit here.
 */
export function normalizeBucketKey(key: string): BucketIconKey {
  if (key in BUCKET_ICONS) return key as BucketIconKey;
  if (key === "proceed_to_costing" || key.endsWith("_approved")) return "approved";
  // Costing calls its first bucket "not_done" and Negotiation "to_start" —
  // same bucket, same glyph.
  if (key === "not_done" || key === "to_start") return "not_started";
  return "not_started";
}
