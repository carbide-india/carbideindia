// Tier-3 (2026-05-20) — additive expansion. Manan asked for need_info +
// follow_up_1/2/3 (granular follow-up tracking) and split the four terminal
// "approved/not_approved/cancelled/transferred" values into a *separate*
// admin-only `approval_status` column. The legacy four values stay in this
// enum so 240 imported tasks keep rendering; new code should write the new
// statuses + approval_status independently.
export const TASK_STATUSES = [
  "dont_know",      // Manan 2026-05 — "I haven't assessed this yet" (light grey)
  "not_started",
  "initiated",
  "follow_up",
  "need_help",
  "on_hold",
  "need_info",      // NEW
  "follow_up_1",    // NEW
  "follow_up_2",    // NEW
  "follow_up_3",    // NEW
  "done",
  // Legacy terminal values — kept for backward compat with imported data.
  // New code should use the `approval_status` column instead.
  "approved",
  "not_approved",
  "cancelled",
  "transferred",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Statuses available to non-admin users in the in-app status picker.
 *  The legacy four (approved / not_approved / cancelled / transferred) are
 *  excluded — those are admin-only via the separate approval_status column.
 *  2026-06-08 (sir's changes #2): the granular follow_up_1/2/3 collapsed back
 *  into the single `follow_up`; cancelled is gone (use Archive instead). */
export const USER_TASK_STATUSES = [
  "dont_know",
  "not_started",
  "initiated",
  "follow_up",
  "on_hold",
  "need_info",
  "done",
] as const satisfies readonly TaskStatus[];

export const PENDING_STATUSES = [
  "dont_know",
  "not_started",
  "initiated",
  "follow_up",
  "on_hold",
  "need_info",
] as const satisfies readonly TaskStatus[];

/** Statuses retired on 2026-06-08 (sir's changes #2/#4/#6) and 2026-06-10
 *  (need_help). The physical pgEnum keeps them so already-imported rows still
 *  render, but nothing user-facing should offer them: filter them out of every
 *  picker, filter dropdown and kanban column. The follow_up_* rows migrate to
 *  `follow_up`; cancelled/transferred rows migrate to Archived; need_help rows
 *  migrate to `need_info` (see db/migrations/0051_retire_need_help.sql). */
export const DEPRECATED_TASK_STATUSES = [
  "follow_up_1",
  "follow_up_2",
  "follow_up_3",
  "cancelled",
  "transferred",
  "need_help",
] as const satisfies readonly TaskStatus[];

const DEPRECATED_STATUS_SET: ReadonlySet<TaskStatus> = new Set(
  DEPRECATED_TASK_STATUSES,
);

/** True for statuses retired on 2026-06-08 — use to drop them from any
 *  dynamically-built status list (filter options, kanban columns, …). */
export function isDeprecatedStatus(status: TaskStatus): boolean {
  return DEPRECATED_STATUS_SET.has(status);
}

/** What admins see in the in-app status pickers: every live status (incl.
 *  the approval verdicts, so they can force a state) minus retired values. */
export const ADMIN_TASK_STATUSES: readonly TaskStatus[] = TASK_STATUSES.filter(
  (s) => !DEPRECATED_STATUS_SET.has(s),
);

// New admin-only column. Defaults to NULL (no approval verdict yet); the
// terminal verdict moves the task out of "pending" without touching status.
export const APPROVAL_STATUSES = [
  "approved",
  "not_approved",
  "cancelled",
  "transferred",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

// 28 canonical subject categories the New Task form constrains to. Free
// text remains valid in the DB (the column is `text`) — older tasks may
// hold values outside this list; the dropdown adds "Other…" as an escape
// hatch when needed.
// Tier-4 (2026-05-20) — recurrence options for the GCal-style scheduling
// block on each task. Stored as text on tasks.recurrence; null/'none'
// mean a one-off. Not wired to any real calendar (no Google API yet).
export const TASK_RECURRENCES = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "yearly",
] as const;
export type TaskRecurrence = (typeof TASK_RECURRENCES)[number];

export const RECURRENCE_LABELS: Record<TaskRecurrence, string> = {
  none:    "Does not repeat",
  daily:   "Daily",
  weekly:  "Weekly",
  monthly: "Monthly",
  yearly:  "Yearly",
};

export const TASK_SUBJECTS = [
  "Marketing",
  "Exhibition",
  "CP Sign Up",
  "Mandate",
  "Invoicing",
  "MIS",
  "Admin",
  "Recruitment",
  "Accounts",
  "PR",
  "Customer Visit",
  "Documentation",
  "Liasoning",
  "Sales",
  "Systems",
  "KPI",
  "Assessment",
  "Basic Checklist",
  "CF Checklist",
  "Follow Up Basic Docs",
  "Call Client to complete File",
  "Call CP to complete File",
  "Reimbursement",
  "Collection",
  "Lead Management",
  "Agreement Signing",
  "Bank Follow Up",
] as const;
export type TaskSubject = (typeof TASK_SUBJECTS)[number];

export const EMPLOYEE_ROLES = ["doer", "initiator", "both"] as const;
export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];

export const TASK_PRIORITIES = [
  "imp_urgent",
  "imp_not_urgent",
  "not_imp_urgent",
  "not_imp_not_urgent",
] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

// Manan 2026-05-30 — priorities renamed to a simple 1-4 scale. The
// underlying Eisenhower enum values are unchanged (no data migration); only
// the user-facing labels change, system-wide via this single map.
//   Critical  = Important & Urgent
//   Important = Important, Not Urgent
//   Urgent    = Not Important, Urgent
//   Normal    = Not Important, Not Urgent
export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  imp_urgent:         "Critical",
  imp_not_urgent:     "Important",
  not_imp_urgent:     "Urgent",
  not_imp_not_urgent: "Normal",
};

export const DEPARTMENTS = [
  "Founder Office",
  "Handholding",
  "Apps",
  "Sales",
  "Marketing",
  "Social Media",
  "Accounts",
  "Admin",
  "HR",
  "Consulting",
  "CRM",
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const AGE_BUCKETS = [
  { id: "0-3", label: "0-3 days", min: 0, max: 3 },
  { id: "4-7", label: "4-7 days", min: 4, max: 7 },
  { id: "8-14", label: "8-14 days", min: 8, max: 14 },
  { id: "15-20", label: "15-20 days", min: 15, max: 20 },
  { id: "21-30", label: "21-30 days", min: 21, max: 30 },
  { id: "31-45", label: "31-45 days", min: 31, max: 45 },
  { id: "46-60", label: "46-60 days", min: 46, max: 60 },
  { id: "60+", label: "60+ days", min: 61, max: Infinity },
] as const;

export type AgeBucketId = (typeof AGE_BUCKETS)[number]["id"];

// ── Attendance (migration 0053) ─────────────────────────────────────────────
// Ported from the legacy ecosystem static forms (2026-06-10). The DB columns
// are `text` (not pgEnums) so these unions are the canonical source of truth.

export const ATTENDANCE_KINDS = ["in", "out"] as const;
export type AttendanceKind = (typeof ATTENDANCE_KINDS)[number];

// M5.1 — palette tokens used by status_settings.color_token and accepted by the
// admin ColorPicker. The 6 names map to canonical pill backgrounds; admins can
// also store a raw hex string (validated by lib/validators/color-token.ts).
export const STATUS_COLOR_TOKENS = [
  "blue",
  "green",
  "amber",
  "red",
  "rose",
  "purple",
  // Extended palette for Manan's status colour scheme.
  "yellow",
  "orange",
  "slate",
  "brown",
  "stone",  // light grey (Dont Know)
] as const;
export type StatusColorToken = (typeof STATUS_COLOR_TOKENS)[number];

// ── Masters (Phase 2 — admin-managed option lists) ─────────────
export const MASTER_KINDS = [
  "customer_type",
  "industry_type",
  "product_type",
  "internal_grade",
  "tolerance",
  "condition",
  // Item Master (2026-06-17): size + shape carry a short `code` used to
  // assemble the internal item code.
  "size",
  "shape",
] as const;
export type MasterKind = (typeof MASTER_KINDS)[number];

/** Item Master costing route. */
export const COSTING_TYPES = ["inhouse", "bought_out", "both"] as const;
export type CostingType = (typeof COSTING_TYPES)[number];
export const COSTING_TYPE_LABELS: Record<CostingType, string> = {
  inhouse: "In-house",
  bought_out: "Bought-out",
  both: "Both",
};

export const MASTER_KIND_LABELS: Record<MasterKind, string> = {
  customer_type: "Customer Type",
  industry_type: "Industry Type",
  product_type: "Product Types",
  internal_grade: "Internal Grade",
  tolerance: "Tolerance",
  condition: "Condition",
  size: "Size",
  shape: "Shape",
};

// ── Inquiry module (Phase 2) — option lists from Manan's sheet ──
export const INQUIRY_PRIORITIES = ["high_profile", "critical", "important", "urgent", "normal"] as const;
export type InquiryPriority = (typeof INQUIRY_PRIORITIES)[number];
export const INQUIRY_PRIORITY_LABELS: Record<InquiryPriority, string> = {
  high_profile: "High Profile", critical: "Critical", important: "Important", urgent: "Urgent", normal: "Normal",
};

export const INQUIRY_SOURCES = ["whatsapp", "email", "sample", "walk_in", "exhibition", "other"] as const;
export type InquirySource = (typeof INQUIRY_SOURCES)[number];
export const INQUIRY_SOURCE_LABELS: Record<InquirySource, string> = {
  whatsapp: "Whatsapp", email: "Email", sample: "Sample", walk_in: "Walk In", exhibition: "Exhibition", other: "Other",
};

export const INQUIRY_CURRENCIES = ["INR", "USD", "EURO", "AUD", "AHD", "Ruble", "Others"] as const;
export const INQUIRY_COUNTRIES = ["India", "USA", "Russia", "Italy", "Poland", "Australia", "UAE", "Spain", "Belgium", "Others"] as const;

export const CHECK_STATES = ["given", "not_given", "assumed"] as const;       // paper checklist V / x / #
export type CheckState = (typeof CHECK_STATES)[number];
export const CHECK_STATE_LABELS: Record<CheckState, string> = { given: "Given", not_given: "Not Given", assumed: "Assumed" };

export const QUANTITY_UOMS = ["Nos", "Kg", "Bag", "Set"] as const;

export const DOC_GIVEN_OPTIONS = ["Whatsapp Msg", "Email", "Drawing", "Sample", "Specification", "Products Excel Sheet", "Terms & Conditions"] as const;

export const INQUIRY_SHAPES = ["Cylinder - Reg", "Cylinder - Spl", "Flat - Reg", "Flat - Spl", "H. Cylinder - Reg", "H. Cylinder - Spl", "Special", "Assembly"] as const;

export const ENQUIRY_STATUSES = ["not_started", "initiated", "need_info", "need_help", "proceed"] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];
export const ENQUIRY_STATUS_LABELS: Record<EnquiryStatus, string> = {
  not_started: "Not Started", initiated: "Initiated", need_info: "Need Info", need_help: "Need Help", proceed: "Proceed",
};
export const ENQUIRY_STATUS_COLORS: Record<EnquiryStatus, string> = {
  not_started: "slate", initiated: "blue", need_info: "amber", need_help: "red", proceed: "green",
};

export const FEAS_VERDICTS = ["to_check", "available", "not_available"] as const;
export type FeasVerdict = (typeof FEAS_VERDICTS)[number];
export const FEAS_VERDICT_LABELS: Record<FeasVerdict, string> = { to_check: "To Check", available: "Available", not_available: "Not Available" };

export const RECHECK_STATES = ["not_done", "yes", "no"] as const;
export type RecheckState = (typeof RECHECK_STATES)[number];
export const RECHECK_STATE_LABELS: Record<RecheckState, string> = { not_done: "Not Done", yes: "Yes", no: "No" };

export const FEASIBILITY_STATUSES = ["not_started", "initiated", "need_info", "need_help", "primary_feasibility_done", "proceed_to_costing"] as const;
export type FeasibilityStatus = (typeof FEASIBILITY_STATUSES)[number];
export const FEASIBILITY_STATUS_LABELS: Record<FeasibilityStatus, string> = {
  not_started: "Not Started", initiated: "Initiated", need_info: "Need Info", need_help: "Need Help",
  primary_feasibility_done: "Primary Feasibility Done", proceed_to_costing: "Proceed to Costing",
};
export const FEASIBILITY_STATUS_COLORS: Record<FeasibilityStatus, string> = {
  not_started: "slate", initiated: "blue", need_info: "amber", need_help: "red",
  primary_feasibility_done: "purple", proceed_to_costing: "green",
};

export const FEAS_PRIORITIES = ["p1", "p2", "p3", "p5_high_profile"] as const;     // sheet: 1, 2, 3, 5. High Profile
export type FeasPriority = (typeof FEAS_PRIORITIES)[number];
export const FEAS_PRIORITY_LABELS: Record<FeasPriority, string> = { p1: "1", p2: "2", p3: "3", p5_high_profile: "5. High Profile" };

// ── Sample Register (Phase 3) — option lists from Manan's sheet ──
export const SAMPLE_LOCATIONS = ["AYK Cabin", "Display", "Jayshree", "Lab", "Other"] as const;

export const SAMPLE_STATUSES = ["received", "to_process", "in_process", "need_info", "need_help", "on_hold", "processed"] as const;
export type SampleStatus = (typeof SAMPLE_STATUSES)[number];
export const SAMPLE_STATUS_LABELS: Record<SampleStatus, string> = {
  received: "Received", to_process: "To Process", in_process: "In Process",
  need_info: "Need Info", need_help: "Need Help", on_hold: "On Hold", processed: "Processed",
};
export const SAMPLE_STATUS_COLORS: Record<SampleStatus, string> = {
  received: "slate", to_process: "blue", in_process: "amber",
  need_info: "orange", need_help: "red", on_hold: "stone", processed: "green",
};

export const STAGE_STATUSES = ["not_started", "in_process", "need_info", "need_help", "on_hold", "done"] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];
export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  not_started: "Not Started", in_process: "In Process", need_info: "Need Info",
  need_help: "Need Help", on_hold: "On Hold", done: "Done",
};
export const STAGE_STATUS_COLORS: Record<StageStatus, string> = {
  not_started: "slate", in_process: "blue", need_info: "amber",
  need_help: "red", on_hold: "stone", done: "green",
};

export const STAGE_LOCATIONS = ["Undecided", "Inhouse", "Lab Testing Company List (to make)", "To Find", "Others"] as const;

export const SAMPLE_REPORT_TYPES = ["Dimension Report", "Chemical Analysis Report", "Drawing Report", "Costing Report"] as const;

// ── Costing module (Phase C) — route + logic enums ──
export const COSTING_ROUTES = ["inhouse", "bought_out"] as const;
export type CostingRoute = (typeof COSTING_ROUTES)[number];
export const COSTING_ROUTE_LABELS: Record<CostingRoute, string> = { inhouse: "In-house", bought_out: "Bought-Out" };
export const COSTING_LOGICS = ["previously_made", "tooling_available", "tooling_to_be_made", "no_tooling"] as const;
export type CostingLogic = (typeof COSTING_LOGICS)[number];
export const COSTING_LOGIC_LABELS: Record<CostingLogic, string> = {
  previously_made: "Previously made", tooling_available: "Tooling available",
  tooling_to_be_made: "Tooling to be made", no_tooling: "No tooling",
};

// ── Quote lifecycle (Phase 4) — from Quote Master / Negotiation / SO sheets ──
export const COSTING_DONE_STATUSES = ["not_done", "in_process", "done"] as const;
export type CostingDoneStatus = (typeof COSTING_DONE_STATUSES)[number];
export const COSTING_DONE_STATUS_LABELS: Record<CostingDoneStatus, string> = {
  not_done: "Not Done", in_process: "In Process", done: "Done",
};
export const COSTING_DONE_STATUS_COLORS: Record<CostingDoneStatus, string> = {
  not_done: "slate", in_process: "amber", done: "green",
};

export const NEGOTIATION_STATUSES = [
  "to_start", "follow_up", "revision", "verbal_yes",
  "order_won", "order_lost", "order_abandoned", "need_help", "on_hold",
] as const;
export type NegotiationStatus = (typeof NEGOTIATION_STATUSES)[number];
export const NEGOTIATION_STATUS_LABELS: Record<NegotiationStatus, string> = {
  to_start: "To Start", follow_up: "Follow up", revision: "Revision", verbal_yes: "Verbal Yes",
  order_won: "Order Won", order_lost: "Order Lost", order_abandoned: "Order Abandoned",
  need_help: "Need Help", on_hold: "On Hold",
};
export const NEGOTIATION_STATUS_COLORS: Record<NegotiationStatus, string> = {
  to_start: "slate", follow_up: "blue", revision: "amber", verbal_yes: "purple",
  order_won: "green", order_lost: "red", order_abandoned: "stone",
  need_help: "red", on_hold: "stone",
};

// ── Daily Client Meeting Feedback ──
export const MEETING_PURPOSES = ["regular_order","new_order","payment_follow_up","upsell","courtesy_meeting","customer_complaints","enquiry_generation","other"] as const;
export type MeetingPurpose = (typeof MEETING_PURPOSES)[number];
export const MEETING_PURPOSE_LABELS: Record<MeetingPurpose, string> = {
  regular_order:"Regular Order", new_order:"New Order", payment_follow_up:"Payment Follow Up",
  upsell:"Upsell", courtesy_meeting:"Courtesy Meeting", customer_complaints:"Customer Complaints",
  enquiry_generation:"Enquiry Generation", other:"Other",
};
export const MEETING_PURPOSE_COLORS: Record<MeetingPurpose, string> = {
  regular_order:"green", new_order:"blue", payment_follow_up:"amber", upsell:"purple",
  courtesy_meeting:"slate", customer_complaints:"red", enquiry_generation:"blue", other:"stone",
};

/** How the client meeting came about. A plain free-text list (the column is
 *  `text`, NOT a pgEnum) so it stays flexible — "Other" reveals a specify input
 *  whose TYPED value is what gets stored (never the literal "Other"). */
export const MEETING_SOURCES = ["WhatsApp","Call","Email","In-Person Visit","Walk In","Exhibition","Reference","Other"] as const;

// ── Customer Master normalization (ERP Phase 2) ──
// GST registration type per customer (commercial/tax). Stored as a pgEnum on
// clients.gst_registration_type.
export const GST_REGISTRATION_TYPES = [
  "regular",
  "composition",
  "unregistered",
  "sez",
  "overseas",
  "uin",
  "deemed_export",
] as const;
export type GstRegistrationType = (typeof GST_REGISTRATION_TYPES)[number];
export const GST_REGISTRATION_TYPE_LABELS: Record<GstRegistrationType, string> = {
  regular: "Regular",
  composition: "Composition",
  unregistered: "Unregistered",
  sez: "SEZ",
  overseas: "Overseas",
  uin: "UIN",
  deemed_export: "Deemed Export",
};

// Address types for the normalized client_addresses child table.
export const ADDRESS_TYPES = ["registered", "bill_to", "ship_to", "consignee"] as const;
export type AddressType = (typeof ADDRESS_TYPES)[number];
export const ADDRESS_TYPE_LABELS: Record<AddressType, string> = {
  registered: "Registered",
  bill_to: "Bill To",
  ship_to: "Ship To",
  consignee: "Consignee",
};

// ── Audit trail (ERP Phase 1) — generic append-only change history ──
// Legally-required (India Companies Act) entity change log. The `action`
// column is a pgEnum; everything else (entity_type, label, summary) is free
// text so any entity can be audited without schema churn.
export const AUDIT_ACTIONS = ["create", "update", "delete", "restore"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
