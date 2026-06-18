import {
  pgEnum,
  pgTable,
  pgSequence,
  text,
  timestamp,
  uuid,
  index,
  boolean,
  jsonb,
  integer,
  numeric,
  primaryKey,
  time,
  date,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  TASK_STATUSES,
  EMPLOYEE_ROLES,
  TASK_PRIORITIES,
  APPROVAL_STATUSES,
  MASTER_KINDS,
  ENQUIRY_STATUSES,
  FEASIBILITY_STATUSES,
  CHECK_STATES,
  FEAS_VERDICTS,
  RECHECK_STATES,
  INQUIRY_PRIORITIES,
  INQUIRY_SOURCES,
  FEAS_PRIORITIES,
  SAMPLE_STATUSES,
  STAGE_STATUSES,
  COSTING_DONE_STATUSES,
  NEGOTIATION_STATUSES,
  MEETING_PURPOSES,
  COSTING_TYPES,
} from "./enums";

/**
 * Friendly sequential task number (#1042). Originally created by migration
 * 0048 (pre-Neon era); declared here so the squashed Neon init migration
 * recreates it. Starts at 1000 so every task reads as a tidy 4-digit number.
 * `tasks.task_no` defaults to nextval() of this sequence — the DB assigns
 * the number; app inserts never supply it.
 */
export const tasksTaskNoSeq = pgSequence("tasks_task_no_seq", {
  startWith: 1000,
});

export const taskStatusEnum = pgEnum("task_status", TASK_STATUSES);
export const employeeRoleEnum = pgEnum("employee_role", EMPLOYEE_ROLES);
export const taskPriorityEnum = pgEnum("task_priority", TASK_PRIORITIES);
export const approvalStatusEnum = pgEnum("approval_status", APPROVAL_STATUSES);

export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: employeeRoleEnum("role").notNull(),
  avatarUrl: text("avatar_url"),
  // Legacy free-text department.  Kept during the M3 soft migration:
  // every server action that sets department writes BOTH this column
  // and `department_id` so existing readers (status table, CSV, etc.)
  // keep working.  Will be dropped in a future migration once the FK
  // is verified-authoritative.
  department: text("department"),
  // M3: canonical FK into `departments`.  Source of truth for the
  // admin-managed list; nullable until an admin picks one.
  departmentId: uuid("department_id").references(() => departments.id, {
    onDelete: "set null",
  }),
  // Job title / role designation (e.g. "Sales Coordinator", "Maintenance
  // Head") — free text, distinct from the doer/initiator task `role`.
  designation: text("designation"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // M2.0 additions (auth identity now lives in Clerk):
  clerkUserId: text("clerk_user_id").unique(),
  isAdmin: boolean("is_admin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  // M2.3-lite: inbox last-visit marker — drives unread-badge math.
  lastInboxVisitAt: timestamp("last_inbox_visit_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // M4 — multi-channel dispatch: per-channel opt-in flags.
  emailOptIn: boolean("email_opt_in").notNull().default(true),
  // Profile v2 (migration 0035) — identity, workflow, appearance preferences.
  // All columns NOT NULL with defaults so existing rows behave identically.
  bio: text("bio"),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  availability: text("availability")
    .notNull()
    .default("available")
    .$type<"available" | "focused" | "heads_down" | "away">(),
  availabilityAutoRevertAt: timestamp("availability_auto_revert_at", { withTimezone: true }),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  workingHoursStart: time("working_hours_start").notNull().default("10:00"),
  workingHoursEnd: time("working_hours_end").notNull().default("19:00"),
  workingDays: integer("working_days").array().notNull().default(sql`'{1,2,3,4,5,6}'::int[]`),
  quietHoursStart: time("quiet_hours_start"),
  quietHoursEnd: time("quiet_hours_end"),
  digestTime: time("digest_time").notNull().default("08:00"),
  digestFrequency: text("digest_frequency")
    .notNull()
    .default("daily")
    .$type<"off" | "daily" | "weekly">(),
  theme: text("theme")
    .notNull()
    .default("system")
    .$type<"light" | "dark" | "system">(),
  density: text("density").notNull().default("cozy").$type<"cozy" | "compact">(),
  accent: text("accent").notNull().default("#3F3F94"),
  oooStart: date("ooo_start"),
  oooEnd: date("ooo_end"),
  oooDelegateId: uuid("ooo_delegate_id").references((): AnyPgColumn => employees.id, {
    onDelete: "set null",
  }),
  managerId: uuid("manager_id").references((): AnyPgColumn => employees.id, {
    onDelete: "set null",
  }),
  // Profile v2 (migration 0038) — mention escalation override scalar.
  mentionEscalation: boolean("mention_escalation").notNull().default(true),
  // Google Calendar sync (migration 0043) — per-user OAuth. The refresh token
  // is long-lived; we exchange it for short-lived access tokens on demand.
  // Server-only: never selected into client-bound queries.
  googleRefreshToken: text("google_refresh_token"),
  googleEmail: text("google_email"),
  googleConnectedAt: timestamp("google_connected_at", { withTimezone: true }),
});

/**
 * Profile v2 — achievements_earned (migration 0040).
 * Per-user badge unlocks. Definitions live in `lib/achievements/definitions.ts`
 * keyed by string; no separate `achievements` table to seed.
 */
export const achievementsEarned = pgTable(
  "achievements_earned",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    achievementKey: text("achievement_key").notNull(),
    earnedAt: timestamp("earned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    progress: jsonb("progress"),
  },
  (t) => [index("achievements_earned_employee_idx").on(t.employeeId)],
);

/**
 * Profile v2 — pinned_items (migration 0039).
 * Per-user shelf of pinned tasks/projects/documents on /profile.
 * Order via `sort_order`; uniqueness on (employee, kind, item).
 */
export const pinnedItems = pgTable(
  "pinned_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().$type<"task" | "project" | "document">(),
    itemId: uuid("item_id").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    pinnedAt: timestamp("pinned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("pinned_items_employee_idx").on(t.employeeId, t.sortOrder)],
);

/**
 * Profile v2 — notification_preferences (migration 0038).
 * Per-recipient × per-kind × per-channel override matrix. Absence of a
 * row means "fall back to the legacy email_opt_in scalar on employees".
 */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    channel: text("channel").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notification_preferences_employee_idx").on(t.employeeId),
  ],
);

/**
 * Profile v2 — audit_data_exports (migration 0037).
 * "Download my data" request log. requestDataExport (profile actions) queues
 * rows in `pending` state; no worker consumes them yet — the table records
 * the requests until an export pipeline ships.
 */
export const auditDataExports = pgTable(
  "audit_data_exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    filePath: text("file_path"),
    status: text("status")
      .notNull()
      .default("pending")
      .$type<"pending" | "processing" | "done" | "failed">(),
    error: text("error"),
  },
  (t) => [
    index("audit_data_exports_employee_idx").on(
      t.employeeId,
      t.requestedAt,
    ),
  ],
);

/**
 * M3 — admin-managed list of departments.  The seed migration backfills
 * one row per distinct existing `employees.department` value; from then
 * on admins maintain the list via /admin/departments.  `is_active`
 * controls whether the dept shows up in pickers; we never hard-delete
 * (employees keep their FK reference).
 */
export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("departments_active_sort_idx").on(t.isActive, t.sortOrder, t.name)],
);

/**
 * Many-to-many membership: one person can belong to several departments.
 * Source of truth for department membership.  The `is_primary` row mirrors
 * the legacy single-department columns on `employees` (department / department_id)
 * — exactly one membership per employee should carry is_primary = true, and
 * that one feeds every single-label reader (task rows, CSV, status table).
 */
export const employeeDepartments = pgTable(
  "employee_departments",
  {
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.employeeId, t.departmentId] }),
    index("employee_departments_department_idx").on(t.departmentId),
    index("employee_departments_employee_idx").on(t.employeeId),
  ],
);

/**
 * Client list — backs the "Client Name" picker on the task forms.  Mirrors
 * the `departments` pattern: an admin/seed-managed canonical list that the
 * New Task / Edit Task dropdowns read from.  Unlike departments, ANY
 * authenticated user can append a new client inline ("+ Add new client…")
 * while creating a task, so the insert RLS policy is open to all
 * authenticated users (see migration 0022).  We never hard-delete; flip
 * `is_active` to hide a client from the picker.
 */
export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    // ── Carbide KYC (Phase 2) — auto-fetch source for inquiries ──
    customerTypeId: uuid("customer_type_id").references(() => masterOptions.id, { onDelete: "set null" }),
    industryTypeId: uuid("industry_type_id").references(() => masterOptions.id, { onDelete: "set null" }),
    productTypeIds: uuid("product_type_ids").array(),  // multi-select checkboxes
    export: boolean("export"),
    currency: text("currency"),
    country: text("country"),
    state: text("state"),
    city: text("city"),
    addressLine1: text("address_line_1"),
    addressLine2: text("address_line_2"),
    addressLine3: text("address_line_3"),
    addressLine4: text("address_line_4"),
    pinCode: text("pin_code"),
    // ── Commercial / tax (Customer Master import) ──
    gstin: text("gstin"),
    panNo: text("pan_no"),
    billToAddress: text("bill_to_address"),
    paymentTerms: text("payment_terms"),
    freightCharges: text("freight_charges"),
    qtyDeviation: text("qty_deviation"),
    // ── Customer categorization (Alok 2026-06-17): open, multi-value, optional
    //    tags — "what kind of customer he is" (Mining / Defense / Cutting …). ──
    tags: text("tags").array(),
    // ── Client KYC meeting (Phase 3) — times as "HH:mm" text, sheet-true ──
    kycMeetingDate: timestamp("kyc_meeting_date", { withTimezone: true }),
    kycMeetingStart: text("kyc_meeting_start"),
    kycMeetingEnd: text("kyc_meeting_end"),
    kycMeetingNotes: text("kyc_meeting_notes"),
    // Sales person who ran the KYC meeting (the form's "Sales Person Name").
    kycSalesPersonId: uuid("kyc_sales_person_id").references(() => employees.id, { onDelete: "set null" }),
    // General notes about this client (free text, optional).
    notes: text("notes"),
    // Business-card scans (Vercel Blob, optional — never block save).
    businessCardFrontUrl: text("business_card_front_url"),
    businessCardBackUrl: text("business_card_back_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("clients_active_name_idx").on(t.isActive, t.name),
    // Case-insensitive uniqueness: the inquiry-form upsert looks clients up
    // by lower(name); without this, a concurrent "Acme"/"ACME" race could
    // create two case-variant clients past the case-sensitive name unique.
    uniqueIndex("clients_name_lower_uidx").on(sql`lower(${t.name})`),
  ],
);

/**
 * Contact persons per client (Phase 2 KYC). The `is_primary` row feeds the
 * Old-client auto-fetch on the inquiry form; an inquiry snapshots the
 * contact fields rather than referencing this table.
 */
export const clientContacts = pgTable(
  "client_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    designation: text("designation"),
    contactNo: text("contact_no"),
    email: text("email"),
    ccEmails: text("cc_emails"),
    notes: text("notes"),
    isPrimary: boolean("is_primary").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("client_contacts_client_idx").on(t.clientId)],
);
export type ClientContact = typeof clientContacts.$inferSelect;

/**
 * Subjects — canonical list backing the "Subject" picker on the task forms.
 * Mirrors the `clients` pattern exactly: an admin/seed-managed list that the
 * New Task / Edit Task dropdowns read from, with an inline "+ Add new
 * subject…" affordance open to any authenticated user. Stored on the
 * free-text `tasks.subject` column; renames propagate to matching tasks.
 */
export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("subjects_active_name_idx").on(t.isActive, t.name)],
);

export const masterKindEnum = pgEnum("master_kind", MASTER_KINDS);

/**
 * Generic admin-managed option lists ("masters" in Carbide language).
 * One table, six kinds — Customer Type, Industry Type, Product Types,
 * Internal Grade, Tolerance, Condition. Admin-only additions (sheet
 * note: "user cannot add on his own").
 */
export const masterOptions = pgTable(
  "master_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: masterKindEnum("kind").notNull(),
    name: text("name").notNull(),
    // Short code used to assemble the Item Master code (e.g. Shape "Cylinder -
    // Reg" → "C", Condition "Sintered" → "B", Size "Small" → "S"). Optional;
    // only the item-code masters (size/shape/condition/grade) carry one.
    code: text("code"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("master_options_kind_name_uidx").on(
      t.kind,
      sql`lower(${t.name})`,
    ),
    index("master_options_kind_active_sort_idx").on(
      t.kind,
      t.isActive,
      t.sortOrder,
    ),
  ],
);
export type MasterOption = typeof masterOptions.$inferSelect;
export type NewMasterOption = typeof masterOptions.$inferInsert;

// ── Inquiry module (Phase 2) ────────────────────────────────────
export const enquiryStatusEnum = pgEnum("enquiry_status", ENQUIRY_STATUSES);
export const feasibilityStatusEnum = pgEnum("feasibility_status", FEASIBILITY_STATUSES);
export const checkStateEnum = pgEnum("check_state", CHECK_STATES);
export const feasVerdictEnum = pgEnum("feas_verdict", FEAS_VERDICTS);
export const recheckStateEnum = pgEnum("recheck_state", RECHECK_STATES);
export const inquiryPriorityEnum = pgEnum("inquiry_priority", INQUIRY_PRIORITIES);
export const inquirySourceEnum = pgEnum("inquiry_source", INQUIRY_SOURCES);
export const feasPriorityEnum = pgEnum("feas_priority", FEAS_PRIORITIES);

/** SM numbers: SM9579, SM9580, … (observed last manual number SM9578).
 *  Admin can re-base via setval through the admin settings action. */
export const smNumberSeq = pgSequence("inquiries_sm_number_seq", { startWith: 9579 });

export const inquiries = pgTable(
  "inquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    smNumber: text("sm_number").notNull().unique()
      .default(sql`'SM' || nextval('inquiries_sm_number_seq')`),
    enquiryDate: timestamp("enquiry_date", { withTimezone: true }).notNull().defaultNow(),
    priority: inquiryPriorityEnum("priority").notNull().default("normal"),
    source: inquirySourceEnum("source"),

    // client linkage + snapshot (copied at creation; never re-synced)
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    companyName: text("company_name").notNull(),
    export: boolean("export"),
    currency: text("currency").notNull().default("INR"),
    country: text("country").notNull().default("India"),
    state: text("state"), city: text("city"),
    addressLine1: text("address_line_1"), addressLine2: text("address_line_2"),
    addressLine3: text("address_line_3"), addressLine4: text("address_line_4"),
    pinCode: text("pin_code"),
    contactFirstName: text("contact_first_name"), contactLastName: text("contact_last_name"),
    contactNo: text("contact_no"), contactEmail: text("contact_email"), ccEmails: text("cc_emails"),

    // product + checklist
    productDescription: text("product_description").notNull(),
    quantityStatus: checkStateEnum("quantity_status"),
    quantityNos: numeric("quantity_nos"),
    quantityUom: text("quantity_uom").notNull().default("Nos"),
    docsGiven: text("docs_given").array(),                       // values from DOC_GIVEN_OPTIONS
    shapeDimensionCheck: checkStateEnum("shape_dimension_check"),
    gradeCheck: checkStateEnum("grade_check"),
    toleranceCheck: checkStateEnum("tolerance_check"),
    conditionCheck: checkStateEnum("condition_check"),
    sampleReceived: boolean("sample_received"),
    shape: text("shape"),                                        // INQUIRY_SHAPES value
    outerDia: numeric("outer_dia"), innerDia: numeric("inner_dia"),
    length: numeric("length"), width: numeric("width"), thickness: numeric("thickness"),
    dimensionNotes: text("dimension_notes"),
    gradeId: uuid("grade_id").references(() => masterOptions.id, { onDelete: "set null" }),
    toleranceId: uuid("tolerance_id").references(() => masterOptions.id, { onDelete: "set null" }),
    conditionId: uuid("condition_id").references(() => masterOptions.id, { onDelete: "set null" }),
    smFolderLink: text("sm_folder_link"),
    enquiryNotes: text("enquiry_notes"),
    assignedSalesPersonId: uuid("assigned_sales_person_id").references(() => employees.id, { onDelete: "set null" }),
    enquiryStatus: enquiryStatusEnum("enquiry_status").notNull().default("not_started"),

    // ── Primary Feasibility stage ──
    feasShapeDimensionVerdict: feasVerdictEnum("feas_shape_dimension_verdict").default("to_check"),
    feasGradeVerdict: feasVerdictEnum("feas_grade_verdict").default("to_check"),
    feasToleranceVerdict: feasVerdictEnum("feas_tolerance_verdict").default("to_check"),
    feasConditionVerdict: feasVerdictEnum("feas_condition_verdict").default("to_check"),
    feasPriority: feasPriorityEnum("feas_priority"),
    feasExport: boolean("feas_export"),
    feasSizeDrawingCheck: recheckStateEnum("feas_size_drawing_check").notNull().default("not_done"),
    feasSizeDrawingNotes: text("feas_size_drawing_notes"),
    feasToleranceCheck: recheckStateEnum("feas_tolerance_check").notNull().default("not_done"),
    feasToleranceNotes: text("feas_tolerance_notes"),
    feasGradeAppCheck: recheckStateEnum("feas_grade_app_check").notNull().default("not_done"),
    feasGradeAppNotes: text("feas_grade_app_notes"),
    feasQuantityCheck: recheckStateEnum("feas_quantity_check").notNull().default("not_done"),
    feasQuantityNotes: text("feas_quantity_notes"),
    feasConditionCheck: recheckStateEnum("feas_condition_check").notNull().default("not_done"),
    feasConditionNotes: text("feas_condition_notes"),
    feasActionsList: text("feas_actions_list"),
    feasibilityCheckedById: uuid("feasibility_checked_by_id").references(() => employees.id, { onDelete: "set null" }),
    feasibilityStatus: feasibilityStatusEnum("feasibility_status").notNull().default("not_started"),

    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inquiries_status_idx").on(t.enquiryStatus, t.enquiryDate),
    index("inquiries_company_idx").on(t.companyName),
    index("inquiries_sales_person_idx").on(t.assignedSalesPersonId),
  ],
);
export type Inquiry = typeof inquiries.$inferSelect;
export type NewInquiry = typeof inquiries.$inferInsert;

// ── Inquiry products (Phase A, 2026-06-17): many products per SM ──
export const inquiryItems = pgTable(
  "inquiry_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inquiryId: uuid("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    custProductName: text("cust_product_name"),
    custDrawingNo: text("cust_drawing_no"),
    drawingRevisionNo: text("drawing_revision_no"),
    shape: text("shape"),                               // INQUIRY_SHAPES value
    outerDia: numeric("outer_dia"), innerDia: numeric("inner_dia"),
    length: numeric("length"), width: numeric("width"), thickness: numeric("thickness"),
    dimensionNotes: text("dimension_notes"),
    gradeId: uuid("grade_id").references(() => masterOptions.id, { onDelete: "set null" }),
    gradeCustomer: text("grade_customer"),
    toleranceId: uuid("tolerance_id").references(() => masterOptions.id, { onDelete: "set null" }),
    conditionId: uuid("condition_id").references(() => masterOptions.id, { onDelete: "set null" }),
    quantityNos: numeric("quantity_nos"),
    quantityUom: text("quantity_uom").notNull().default("Nos"),
    // FK to the Item / Product Master (Phase B). onDelete: set null so deleting
    // an item leaves the inquiry line intact, just unlinked.
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("inquiry_items_inquiry_idx").on(t.inquiryId, t.sortOrder)],
);
export type InquiryItem = typeof inquiryItems.$inferSelect;
export type NewInquiryItem = typeof inquiryItems.$inferInsert;

// ── Item / Product Master (2026-06-17, Alok) ────────────────────
export const costingTypeEnum = pgEnum("costing_type", COSTING_TYPES);

/** Item serial → the "10001" in S-10001-C-… */
export const itemSeqSeq = pgSequence("item_seq_seq", { startWith: 10001 });

/**
 * The Item / Product Master. Each unique physical product (by shape + grade +
 * condition + tolerance + dimensions) gets ONE row with a generated internal
 * `item_code`. Most descriptive fields auto-pull from the source Enquiry; the
 * code masters (shape/size/condition/internal grade) carry the short codes the
 * `item_code` is assembled from. `dedup_key` is a normalized fingerprint of the
 * uniqueness columns — a UNIQUE index on it makes "reuse if identical" atomic.
 */
export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: integer("seq").notNull().default(sql`nextval('item_seq_seq')`),
    itemCode: text("item_code").notNull().unique(),
    // Normalized fingerprint of the uniqueness columns (see create action).
    dedupKey: text("dedup_key").notNull(),

    // Source enquiry + snapshots (auto-pulled).
    inquiryId: uuid("inquiry_id").references(() => inquiries.id, { onDelete: "set null" }),
    smNumber: text("sm_number"),
    enquiryDate: timestamp("enquiry_date", { withTimezone: true }),
    customerName: text("customer_name"),
    custProductName: text("cust_product_name"),
    custDrawingNo: text("cust_drawing_no"),
    drawingRevisionNo: text("drawing_revision_no"),
    qty: numeric("qty"),

    // Classification (code-bearing masters) + size class.
    sizeCode: text("size_code"),                 // S / M / L … (derived or chosen)
    shapeId: uuid("shape_id").references(() => masterOptions.id, { onDelete: "set null" }),
    internalGradeId: uuid("internal_grade_id").references(() => masterOptions.id, { onDelete: "set null" }),
    toleranceId: uuid("tolerance_id").references(() => masterOptions.id, { onDelete: "set null" }),
    conditionId: uuid("condition_id").references(() => masterOptions.id, { onDelete: "set null" }),
    gradeCustomer: text("grade_customer"),
    gradeNameForCust: text("grade_name_for_cust"),

    // Dimensions (mm, 2 decimals).
    outerDia: numeric("outer_dia"), innerDia: numeric("inner_dia"),
    length: numeric("length"), width: numeric("width"), thickness: numeric("thickness"),
    dimensionNotes: text("dimension_notes"),

    // Part identity + quotation insert lines.
    partNo: text("part_no"),
    partDescription1: text("part_description_1"),
    partDescription2: text("part_description_2"),
    partDescription3: text("part_description_3"),
    partDescription4: text("part_description_4"),
    partTag: text("part_tag"),
    costingType: costingTypeEnum("costing_type"),

    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("items_dedup_key_uidx").on(t.dedupKey),
    index("items_inquiry_idx").on(t.inquiryId),
    index("items_shape_idx").on(t.shapeId),
  ],
);
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;

// ── Sample Register (Phase 3) ───────────────────────────────────
export const sampleStatusEnum = pgEnum("sample_status", SAMPLE_STATUSES);
export const stageStatusEnum = pgEnum("stage_status", STAGE_STATUSES);

export const samples = pgTable(
  "samples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sampleDate: timestamp("sample_date", { withTimezone: true }).notNull().defaultNow(),
    inquiryId: uuid("inquiry_id").references(() => inquiries.id, { onDelete: "set null" }),
    sampleNo: text("sample_no").notNull().unique(),
    location: text("location").notNull().default("AYK Cabin"),
    responsiblePersonId: uuid("responsible_person_id").references(() => employees.id, { onDelete: "set null" }),
    photoUrls: text("photo_urls").array(),
    sampleNotes: text("sample_notes"),
    sampleStatus: sampleStatusEnum("sample_status").notNull().default("received"),
    dimensionStatus: stageStatusEnum("dimension_status").notNull().default("not_started"),
    dimensionLocation: text("dimension_location").notNull().default("Undecided"),
    dimensionCompletedOn: timestamp("dimension_completed_on", { withTimezone: true }),
    chemicalStatus: stageStatusEnum("chemical_status").notNull().default("not_started"),
    chemicalLocation: text("chemical_location").notNull().default("Undecided"),
    chemicalCompletedOn: timestamp("chemical_completed_on", { withTimezone: true }),
    drawingStatus: stageStatusEnum("drawing_status").notNull().default("not_started"),
    drawingLocation: text("drawing_location").notNull().default("Undecided"),
    drawingCompletedOn: timestamp("drawing_completed_on", { withTimezone: true }),
    costingStatus: stageStatusEnum("costing_status").notNull().default("not_started"),
    costingCompletedOn: timestamp("costing_completed_on", { withTimezone: true }),
    reportsUploaded: text("reports_uploaded").array(),          // SAMPLE_REPORT_TYPES values
    reportsInSmFolder: boolean("reports_in_sm_folder").notNull().default(false),
    processedDate: timestamp("processed_date", { withTimezone: true }),
    processNotes: text("process_notes"),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("samples_status_idx").on(t.sampleStatus, t.sampleDate),
    index("samples_inquiry_idx").on(t.inquiryId),
  ],
);
export type Sample = typeof samples.$inferSelect;
export type NewSample = typeof samples.$inferInsert;

// ── Quotation / Negotiation / Sales Order (Phase 4) ─────────────
export const costingDoneStatusEnum = pgEnum("costing_done_status", COSTING_DONE_STATUSES);
export const negotiationStatusEnum = pgEnum("negotiation_status", NEGOTIATION_STATUSES);

export const quotations = pgTable("quotations", {
  id: uuid("id").primaryKey().defaultRandom(),
  inquiryId: uuid("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }),
  quoteNo: text("quote_no").notNull().unique(),
  // snapshots from the SM (display + history)
  companyName: text("company_name"),
  enquiryDate: timestamp("enquiry_date", { withTimezone: true }),
  custProductName: text("cust_product_name"),
  custDrawingNo: text("cust_drawing_no"),
  drawingRevisionNo: text("drawing_revision_no"),
  qty: numeric("qty"),
  gradeCustomer: text("grade_customer"),
  gradeNameForCust: text("grade_name_for_cust"),
  tolerance: text("tolerance"),
  condition: text("condition"),
  partNo: text("part_no"),
  finalCost: numeric("final_cost"),
  negotiation: numeric("negotiation"),
  quotePrice: numeric("quote_price"),
  developmentTime: text("development_time"),
  deliveryTime: text("delivery_time"),
  validity: text("validity"),
  costingDoneStatus: costingDoneStatusEnum("costing_done_status").notNull().default("not_done"),
  quotationLink: text("quotation_link"),
  quoteSent: boolean("quote_sent").notNull().default(false),
  createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("quotations_inquiry_idx").on(t.inquiryId)]);
export type Quotation = typeof quotations.$inferSelect;
export type NewQuotation = typeof quotations.$inferInsert;

export const negotiations = pgTable("negotiations", {
  id: uuid("id").primaryKey().defaultRandom(),
  inquiryId: uuid("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }),
  quotationId: uuid("quotation_id").references(() => quotations.id, { onDelete: "set null" }),
  negotiationNo: text("negotiation_no").notNull().unique(),
  companyName: text("company_name"),
  enquiryDate: timestamp("enquiry_date", { withTimezone: true }),
  salesPersonId: uuid("sales_person_id").references(() => employees.id, { onDelete: "set null" }),
  custProductName: text("cust_product_name"),
  qty: numeric("qty"),
  partNo: text("part_no"),
  finalCost: numeric("final_cost"),
  negotiation: numeric("negotiation"),
  quotePrice: numeric("quote_price"),
  developmentTime: text("development_time"),
  deliveryTime: text("delivery_time"),
  validity: text("validity"),
  quotationLink: text("quotation_link"),
  negotiationStatus: negotiationStatusEnum("negotiation_status").notNull().default("to_start"),
  negotiationNotes: text("negotiation_notes"),
  createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("negotiations_inquiry_idx").on(t.inquiryId), index("negotiations_status_idx").on(t.negotiationStatus)]);
export type Negotiation = typeof negotiations.$inferSelect;
export type NewNegotiation = typeof negotiations.$inferInsert;

export const salesOrders = pgTable("sales_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  inquiryId: uuid("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }),
  quotationId: uuid("quotation_id").references(() => quotations.id, { onDelete: "set null" }),
  soNo: text("so_no").notNull().unique(),
  companyName: text("company_name"),
  enquiryDate: timestamp("enquiry_date", { withTimezone: true }),
  salesPersonId: uuid("sales_person_id").references(() => employees.id, { onDelete: "set null" }),
  custProductName: text("cust_product_name"),
  qty: numeric("qty"),
  partNo: text("part_no"),
  quotePrice: numeric("quote_price"),
  developmentTime: text("development_time"),
  deliveryTime: text("delivery_time"),
  validity: text("validity"),
  quotationLink: text("quotation_link"),
  customerPoLink: text("customer_po_link"),
  customerPoDate: timestamp("customer_po_date", { withTimezone: true }),
  customerPoNo: text("customer_po_no"),
  customerSoLink: text("customer_so_link"),
  customerSoSent: boolean("customer_so_sent").notNull().default(false),
  productionSoLink: text("production_so_link"),
  createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("sales_orders_inquiry_idx").on(t.inquiryId)]);
export type SalesOrder = typeof salesOrders.$inferSelect;
export type NewSalesOrder = typeof salesOrders.$inferInsert;

// ── Daily Client Meeting Feedback (Phase 5) ─────────────────────
export const meetingPurposeEnum = pgEnum("meeting_purpose", MEETING_PURPOSES);
export const clientMeetingNoSeq = pgSequence("client_meeting_no_seq", { startWith: 1001 });

export const clientMeetings = pgTable("client_meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingNo: text("meeting_no").notNull().unique().default(sql`'MTG' || nextval('client_meeting_no_seq')`),
  salesPersonId: uuid("sales_person_id").references(() => employees.id, { onDelete: "set null" }),
  // Sales Person block — captured free-text (salesPersonId above is the
  // auto-linked current user, used for the register's filter/column).
  salesName: text("sales_name"),
  salesNumber: text("sales_number"),
  salesDesignation: text("sales_designation"),
  salesEmail: text("sales_email"),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  companyName: text("company_name").notNull(),
  // Combined contact name — kept for back-compat with the register's existing
  // column; the action always writes `${first} ${last}`.trim() so the NOT NULL
  // holds. First/last below are the new captured fields.
  contactPersonName: text("contact_person_name").notNull(),
  contactFirstName: text("contact_first_name"),
  contactLastName: text("contact_last_name"),
  contactPersonDesignation: text("contact_person_designation"),
  contactNumber: text("contact_number"),
  contactEmail: text("contact_email"),
  meetingDate: timestamp("meeting_date", { withTimezone: true }).notNull().defaultNow(),
  // Legacy single time — kept nullable/unused; start/end below replace it.
  meetingTime: text("meeting_time"),
  meetingStartTime: text("meeting_start_time"),
  meetingEndTime: text("meeting_end_time"),
  meetingSource: text("meeting_source"),
  clientType: text("client_type"),
  purpose: meetingPurposeEnum("purpose").notNull().default("regular_order"),
  purposeOther: text("purpose_other"),
  meetingNotes: text("meeting_notes"),
  nextFollowUpDate: timestamp("next_follow_up_date", { withTimezone: true }),
  selfieUrl: text("selfie_url"),
  createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("client_meetings_date_idx").on(t.meetingDate), index("client_meetings_sales_idx").on(t.salesPersonId)]);
export type ClientMeeting = typeof clientMeetings.$inferSelect;
export type NewClientMeeting = typeof clientMeetings.$inferInsert;

/**
 * Project Management (Manan #23/#24). A self-referential tree:
 * Project → Milestone → Result. Tasks link to any node via
 * `tasks.project_node_id` (the "action" connected to a project/milestone/
 * result). We never hard-delete — archive instead.
 */
export const projectNodes = pgTable(
  "project_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    kind: text("kind")
      .$type<"project" | "milestone" | "result" | "action" | "sub_action">()
      .notNull(),
    parentId: uuid("parent_id"),
    sortOrder: integer("sort_order").notNull().default(100),
    isArchived: boolean("is_archived").notNull().default(false),
    // #13 — overhaul fields.
    description: text("description"),
    notes: text("notes"),
    targetDate: timestamp("target_date", { withTimezone: true }),
    ownerId: uuid("owner_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("project_nodes_parent_idx").on(t.parentId),
    index("project_nodes_kind_idx").on(t.kind, t.isArchived),
  ],
);

/**
 * #13 — team members involved in a project node (alongside owner_id).
 * Composite PK so a person can't be added twice to the same node.
 */
export const projectMembers = pgTable(
  "project_members",
  {
    projectNodeId: uuid("project_node_id")
      .notNull()
      .references(() => projectNodes.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectNodeId, t.employeeId] })],
);

/**
 * Document library (Manan #27/#28). The catalogue for files stored as
 * private Vercel Blob objects under the `documents/` pathname prefix
 * (storage_path holds the blob pathname; downloads are presigned per
 * render) — title required, description optional, with provenance and an
 * optional link to a task.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    uploadedById: uuid("uploaded_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("documents_created_idx").on(t.createdAt),
    index("documents_task_idx").on(t.taskId),
  ],
);

// M5.1 — admin-managed display overrides for the 9 task statuses. PK is the
// task_status enum value; updates only (RLS: insert/delete revoked at the
// table level + only `update` policy). Seeded by migration 0016 so the
// default render is identical to today's hard-coded labels/tones.
export const statusSettings = pgTable("status_settings", {
  status: taskStatusEnum("status").primaryKey(),
  label: text("label").notNull(),
  colorToken: text("color_token").notNull(),
  displayOrder: integer("display_order").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedById: uuid("updated_by_id").references(() => employees.id, {
    onDelete: "set null",
  }),
});

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    doerId: uuid("doer_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    initiatorId: uuid("initiator_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    priority: taskPriorityEnum("priority").notNull().default("not_imp_not_urgent"),
    status: taskStatusEnum("status").notNull().default("not_started"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    transferredFromId: uuid("transferred_from_id").references(
      () => employees.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    subject: text("subject"),
    // Client this task belongs to. Free-text mirroring `subject` (the
    // `clients` table is just the picker roster). Added in migration 0042 and
    // backfilled from the old "Client/Participant:" notes / form title.
    client: text("client"),
    // Google Calendar sync (migration 0043): the event id created on the
    // synced doer's calendar, and which doer's calendar holds it (so a
    // reassign can move the event). Null when not synced.
    googleEventId: text("google_event_id"),
    googleSyncedDoerId: uuid("google_synced_doer_id"),
    archived: boolean("archived").notNull().default(false),
    // M2.1 additions — provenance + approval (approved_* used in M2.2) + optimistic lock
    createdById: uuid("created_by_id").references(() => employees.id, {
      onDelete: "restrict",
    }),
    approvedById: uuid("approved_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvalNote: text("approval_note"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    legacyImportKey: text("legacy_import_key"),
    shortId: text("short_id"),
    // Friendly sequential task number (#1042). DB-assigned via the
    // `tasks_task_no_seq` sequence default declared above; kept nullable in
    // TS so inserts don't have to supply it and the DB fills it in.
    taskNo: integer("task_no").default(sql`nextval('tasks_task_no_seq')`),
    // Tier-3 (2026-05-20) additions:
    //   tags          — comma-of-chips, free-form (no enum). NULL = no tags.
    //   approvalStatus — admin-only verdict layered on top of `status`. NULL
    //                    = no verdict yet; when set, surfaces on the row +
    //                    the dashboard's "Task Approval Status" axis.
    //   revisedTargetDate — admin-only revised due date. Coexists with
    //                       `due_at` so the original commitment isn't lost.
    tags: text("tags").array(),
    approvalStatus: approvalStatusEnum("approval_status"),
    revisedTargetDate: timestamp("revised_target_date", { withTimezone: true }),
    // Read-receipt (migration 0045): set when any user first opens the task
    // detail. NULL = never opened. Powers the "Not Read" stat card.
    firstReadAt: timestamp("first_read_at", { withTimezone: true }),
    // Tier-4 (2026-05-20) — Google-Calendar-style internal scheduling.
    // NOT synced to any actual calendar API; these are just metadata
    // fields the team uses to plan when work happens.
    //   startsAt / endsAt — explicit time block when the task is on the
    //     calendar. Independent of due_at (which is the deadline).
    //   allDay — when true, the time portion of starts_at / ends_at is
    //     decorative; UI shows "All day" instead of clock times.
    //   recurrence — repeat pattern token ("none" | "daily" | "weekly" |
    //     "monthly" | "yearly"). Null treated as "none".
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    recurrence: text("recurrence"),
    // Manan #20 — RRULE-lite structured recurrence (weekdays / monthly mode /
    // end). Coexists with `recurrence` (coarse frequency). Originals carry
    // the rule; materialized child instances do not (parent_id points back).
    recurrenceRule: text("recurrence_rule"),
    // Phase 5.2 — recurrence materialization markers. NULL on originals
    // (rule-holders); set on every dated instance the cron creates.
    recurrenceParentId: uuid("recurrence_parent_id"),
    recurrenceOccurrenceDate: text("recurrence_occurrence_date"),
    // Manan #24 — optional link to a Project Management node (the "action"
    // connected to a project / milestone / result). The FK + onDelete SET
    // NULL + matching index were created by migration 0027; the
    // `.references()` declaration is mirrored here so drizzle-kit
    // generate stays consistent with the DB.
    projectNodeId: uuid("project_node_id").references(() => projectNodes.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("tasks_doer_created_idx").on(t.doerId, t.createdAt),
    index("tasks_initiator_created_idx").on(t.initiatorId, t.createdAt),
    index("tasks_status_created_idx").on(t.status, t.createdAt),
    index("tasks_pending_created_idx")
      .on(t.createdAt)
      .where(
        sql`${t.status} IN ('not_started','initiated','follow_up','need_help','need_info','follow_up_1','follow_up_2','follow_up_3')`,
      ),
    index("tasks_archived_idx").on(t.archived, t.createdAt),
    index("tasks_created_by_idx").on(t.createdById),
    index("tasks_approval_status_idx").on(t.approvalStatus),
    // Added 2026-05-25 (migration 0029) to back the queries flagged by
    // the hardening audit — see the migration file for context.
    index("tasks_due_at_idx").on(t.dueAt),
    index("tasks_approved_by_idx").on(t.approvedById),
    index("tasks_transferred_from_idx").on(t.transferredFromId),
    index("tasks_project_node_idx").on(t.projectNodeId),
    // Uniqueness guards originally from migrations 0013 + 0048. The
    // `tasks_short_id_uidx` name is load-bearing: createTask / importTasks
    // catch error 23505 on that constraint and retry with a fresh slug.
    uniqueIndex("tasks_legacy_import_key_uidx")
      .on(t.legacyImportKey)
      .where(sql`${t.legacyImportKey} is not null`),
    uniqueIndex("tasks_short_id_uidx")
      .on(t.shortId)
      .where(sql`${t.shortId} is not null`),
    uniqueIndex("tasks_task_no_uidx").on(t.taskNo),
    // Dedup arbiter for the recurrence materializer's `ON CONFLICT
    // (recurrence_parent_id, recurrence_occurrence_date) DO NOTHING`. Without
    // this, every materialization INSERT errors (42P10) and recurring tasks
    // never spawn their next occurrence. Template + non-recurring rows hold
    // (NULL, NULL) and are unconstrained — Postgres treats NULLs as distinct.
    uniqueIndex("tasks_recurrence_occurrence_uidx").on(
      t.recurrenceParentId,
      t.recurrenceOccurrenceDate,
    ),
  ],
);

export const taskEvents = pgTable(
  "task_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    fromValue: jsonb("from_value"),
    toValue: jsonb("to_value"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("task_events_task_created_idx").on(t.taskId, t.createdAt),
    index("task_events_actor_created_idx").on(t.actorId, t.createdAt),
    index("task_events_created_idx").on(t.createdAt),
  ],
);

/**
 * M2.3 — frozen contract for the `kind` column on notifications.
 *
 * Add a new kind here AND in lib/notifications/dispatch.ts.  The DB
 * column is `text` (not an enum) so the union is the canonical source
 * of truth — anything outside it is a TS error at the call site.
 */
export const NOTIFICATION_KINDS = [
  "task_assigned",
  "task_initiated",
  "status_changed",
  "approved",
  "declined",
  "reassigned",
  "transferred",
  "cancelled",
  "commented",
  "overdue_digest",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => taskEvents.id, {
      onDelete: "set null",
    }),
    kind: text("kind").$type<NotificationKind>().notNull(),
    title: text("title").notNull(),
    body: text("body"),
    actorId: uuid("actor_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // M4 — channel-by-channel audit trail of which arms actually
    // delivered for this notification.  Source-of-truth column going
    // forward; the legacy `email_sent_at` is also written in parallel
    // for M2.3-era readers but should NOT be the basis of new logic.
    deliveredChannels: text("delivered_channels")
      .array()
      .notNull()
      .default(sql`'{}'`),
  },
  (t) => [
    index("notifications_user_unread_created_idx").on(
      t.userId,
      t.readAt,
      t.createdAt,
    ),
    index("notifications_user_kind_created_idx").on(
      t.userId,
      t.kind,
      t.createdAt,
    ),
    index("notifications_created_idx").on(t.createdAt),
  ],
);

/**
 * Phase 3.5 — Document mutation audit log. Append-only rows recording every
 * document create / rename / description-change / file-replace / delete.
 * The `documentId` FK is nullable so a delete-event survives after the
 * referenced document row goes away; `documentTitle` is snapshotted at
 * write-time so the log row stays self-readable.
 */
export const documentEvents = pgTable(
  "document_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    documentTitle: text("document_title").notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    eventType: text("event_type")
      .$type<"created" | "renamed" | "description_changed" | "file_replaced" | "deleted">()
      .notNull(),
    fromValue: jsonb("from_value"),
    toValue: jsonb("to_value"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("document_events_doc_created_idx").on(t.documentId, t.createdAt),
    index("document_events_actor_created_idx").on(t.actorId, t.createdAt),
    index("document_events_created_idx").on(t.createdAt),
  ],
);

/**
 * Phase 2.1 — Per-attempt audit + retry queue for notification dispatch.
 * One row per (notification, channel) attempt. The two-arm fan-out in
 * `lib/notifications/dispatch.ts` writes one row per attempt; the
 * `/api/cron/retry-dispatch` route picks up `failed` rows whose
 * `next_attempt_at` has elapsed and re-runs that single channel.
 *
 * `status` values:
 *   - `sent`             — delivered.
 *   - `skipped`          — channel disabled or recipient opted out.
 *   - `failed`           — transient error; retry-eligible.
 *   - `failed_terminal`  — gave up after the retry budget.
 */
export const notificationDispatchLog = pgTable(
  "notification_dispatch_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    channel: text("channel")
      .$type<"email" | "web_push">()
      .notNull(),
    status: text("status")
      .$type<"sent" | "skipped" | "failed" | "failed_terminal">()
      .notNull(),
    errorMessage: text("error_message"),
    attemptCount: integer("attempt_count").notNull().default(1),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notification_dispatch_log_retry_idx")
      .on(t.nextAttemptAt, t.attemptCount)
      .where(sql`status = 'failed'`),
    index("notification_dispatch_log_notification_idx").on(
      t.notificationId,
      t.channel,
      t.attemptedAt,
    ),
  ],
);

/**
 * M4 — Web Push subscriptions.  One row per device that has registered
 * via the Service Worker.  `endpoint` is globally unique; `p256dh` and
 * `auth` are the per-subscription crypto keys returned by the browser's
 * PushManager.  We retain `user_agent` for debug-only display in
 * /profile (so users can recognise which devices are still subscribed).
 *
 * RLS — declared in migration 0014: a user reads/inserts/deletes ONLY
 * their own subscriptions; admins can read + delete anyone's.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

/**
 * M3 — single-row organisation settings.  The CHECK constraint (id = 1)
 * is enforced at the DB level; in app code we always read/write the row
 * via `orgSettings` queries that hard-code `id = 1`.  Adding new
 * org-level knobs = add a column here + bump the form on /admin/settings.
 */
export const orgSettings = pgTable(
  "org_settings",
  {
    id: integer("id").primaryKey().default(1),
    companyName: text("company_name").notNull().default("Carbide India"),
    logoUrl: text("logo_url"),
    digestHourIst: integer("digest_hour_ist").notNull().default(9),
    idleTimeoutMinutes: integer("idle_timeout_minutes").notNull().default(10),
    workingDays: integer("working_days")
      .array()
      .notNull()
      .default(sql`array[1,2,3,4,5]`),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    allowSelfRegister: boolean("allow_self_register").notNull().default(false),
    // M5.1 — per-event channel routing. Key = NotificationKind, value = channels
    // array. The real default matrix is seeded onto the singleton row by
    // scripts/seed-defaults.ts; the empty object below is only the column
    // default for any insert that bypasses the seed.
    notificationMatrix: jsonb("notification_matrix")
      .notNull()
      .$type<Record<string, string[]>>()
      .default({}),
    // sir's changes #8 — admin-defined kanban column order (ordered array of
    // column ids: TaskStatus values + the synthetic "__archived__"). null = use
    // the built-in default order. Lives here, not status_settings, because the
    // Archived column isn't a real status.
    boardColumnOrder: jsonb("board_column_order").$type<string[]>(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedById: uuid("updated_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    // Single-row table — enforced at the DB level (originally migration 0011).
    check("org_settings_id_check", sql`${t.id} = 1`),
  ],
);

/**
 * M3 close-out — append-only admin audit trails.  Two tables so the
 * future "Admin activity" feed can union them with task_events without a
 * second hop.  Pattern mirrors task_events: pin actor_id, lock immutable.
 */
export const employeeEvents = pgTable(
  "employee_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    fromValue: jsonb("from_value"),
    toValue: jsonb("to_value"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("employee_events_employee_created_idx").on(t.employeeId, t.createdAt),
    index("employee_events_actor_created_idx").on(t.actorId, t.createdAt),
    index("employee_events_created_idx").on(t.createdAt),
  ],
);

export const settingsEvents = pgTable(
  "settings_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").notNull(),
    targetId: text("target_id"),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    fromValue: jsonb("from_value"),
    toValue: jsonb("to_value"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("settings_events_scope_target_created_idx").on(
      t.scope,
      t.targetId,
      t.createdAt,
    ),
    index("settings_events_actor_created_idx").on(t.actorId, t.createdAt),
    index("settings_events_created_idx").on(t.createdAt),
  ],
);

/**
 * Attendance (migration 0053) — one row per punch. Ported from the Ecosystem
 * "Employee Attendance Form" (Date + In/Out + Notes). `log_date` is the
 * calendar day in the employee's own timezone, computed server-side at punch
 * time; UNIQUE (employee, day, kind) means one check-in + one check-out per
 * day — a second punch of the same kind is a friendly error, not an update,
 * so the log stays honest.
 */
export const attendanceLogs = pgTable(
  "attendance_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    logDate: date("log_date").notNull(),
    kind: text("kind").$type<"in" | "out">().notNull(),
    loggedAt: timestamp("logged_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    note: text("note"),
  },
  (t) => [
    uniqueIndex("attendance_logs_employee_day_kind_uq").on(
      t.employeeId,
      t.logDate,
      t.kind,
    ),
    index("attendance_logs_date_idx").on(t.logDate),
    index("attendance_logs_employee_date_idx").on(t.employeeId, t.logDate),
  ],
);

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskEvent = typeof taskEvents.$inferSelect;
export type NewTaskEvent = typeof taskEvents.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type OrgSettings = typeof orgSettings.$inferSelect;
export type NewOrgSettings = typeof orgSettings.$inferInsert;
export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
export type EmployeeDepartment = typeof employeeDepartments.$inferSelect;
export type NewEmployeeDepartment = typeof employeeDepartments.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Subject = typeof subjects.$inferSelect;
export type NewSubject = typeof subjects.$inferInsert;
export type ProjectNode = typeof projectNodes.$inferSelect;
export type NewProjectNode = typeof projectNodes.$inferInsert;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
export type NotificationDispatchLog = typeof notificationDispatchLog.$inferSelect;
export type NewNotificationDispatchLog = typeof notificationDispatchLog.$inferInsert;
export type EmployeeEvent = typeof employeeEvents.$inferSelect;
export type NewEmployeeEvent = typeof employeeEvents.$inferInsert;
export type SettingsEvent = typeof settingsEvents.$inferSelect;
export type NewSettingsEvent = typeof settingsEvents.$inferInsert;
export type AuditDataExport = typeof auditDataExports.$inferSelect;
export type NewAuditDataExport = typeof auditDataExports.$inferInsert;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;
export type PinnedItem = typeof pinnedItems.$inferSelect;
export type NewPinnedItem = typeof pinnedItems.$inferInsert;
export type AchievementEarned = typeof achievementsEarned.$inferSelect;
export type NewAchievementEarned = typeof achievementsEarned.$inferInsert;
export type AttendanceLog = typeof attendanceLogs.$inferSelect;
export type NewAttendanceLog = typeof attendanceLogs.$inferInsert;
