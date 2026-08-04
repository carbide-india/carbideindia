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
  FEAS_CHECK_VERDICTS,
  FEAS_RISKS,
  SAMPLE_STATUSES,
  STAGE_STATUSES,
  COSTING_DONE_STATUSES,
  NEGOTIATION_STATUSES,
  NEGOTIATION_STAGES,
  MEETING_PURPOSES,
  COSTING_TYPES,
  ITEM_STATUSES,
  COSTING_ROUTES,
  COSTING_LOGICS,
  AUDIT_ACTIONS,
  GST_REGISTRATION_TYPES,
  ADDRESS_TYPES,
  CLIENT_GRADES,
  PRODUCTION_ORDER_STATUSES,
  PRODUCTION_OP_STATUSES,
  PRODUCTION_QC_RESULTS,
  RM_LOT_STATUSES,
  DISPATCH_STATUSES,
  INVOICE_STATUSES,
  GST_SUPPLY_TYPES,
  PAYMENT_MODES,
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
export const auditActionEnum = pgEnum("audit_action", AUDIT_ACTIONS);

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
  // Firebase auth migration (Phase F1): links an employee row to its Firebase
  // user. Nullable, and kept ALONGSIDE clerkUserId so Clerk stays a working
  // rollback path until the cutover is verified.
  firebaseUid: text("firebase_uid").unique(),
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

/** Client codes: CL-0001, CL-0002,  */
export const clientsClientCodeSeq = pgSequence("clients_client_code_seq", { startWith: 1 });

/**
 * Client list — backs the "Client Name" picker on the task forms.  Mirrors
 * the `departments` pattern: an admin/seed-managed canonical list that the
 * New Task / Edit Task dropdowns read from.  Unlike departments, ANY
 * authenticated user can append a new client inline ("+ Add new client")
 * while creating a task, so the insert RLS policy is open to all
 * authenticated users (see migration 0022).  We never hard-delete; flip
 * `is_active` to hide a client from the picker.
 */
export const gstRegistrationTypeEnum = pgEnum("gst_registration_type", GST_REGISTRATION_TYPES);
export const addressTypeEnum = pgEnum("address_type", ADDRESS_TYPES);
export const clientGradeEnum = pgEnum("client_grade", CLIENT_GRADES);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    // Governance (ERP Phase 4): deactivate-only — clients are never hard-deleted.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(100),
    // ── Carbide KYC (Phase 2) — auto-fetch source for inquiries ──
    customerTypeId: uuid("customer_type_id").references(() => masterOptions.id, { onDelete: "set null" }),
    industryTypeId: uuid("industry_type_id").references(() => masterOptions.id, { onDelete: "set null" }),
    // Multi-select arrays (migration 0026). The singular *_id columns above are
    // kept as a back-compat MIRROR (= first selected id) so inquiry auto-fill,
    // exports and audit that still read the scalar keep working.
    customerTypeIds: uuid("customer_type_ids").array(),  // multi-select checkboxes
    industryTypeIds: uuid("industry_type_ids").array(),  // multi-select checkboxes
    productTypeIds: uuid("product_type_ids").array(),  // multi-select checkboxes
    // Client rating A/B/C (2026-07-13) + owning department (master_options).
    grade: clientGradeEnum("grade"),
    departmentId: uuid("department_id").references(() => masterOptions.id, { onDelete: "set null" }),
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
    // ── Client Master fields (migration 0020) ──
    clientCode: text("client_code").unique()
      .default(sql`'CL-' || lpad(nextval('clients_client_code_seq')::text, 4, '0')`),
    creditDays: integer("credit_days"),
    creditLimit: numeric("credit_limit"),
    bankName: text("bank_name"),
    bankAccountNo: text("bank_account_no"),
    bankIfsc: text("bank_ifsc"),
    bankBranch: text("bank_branch"),
    bankAccountHolder: text("bank_account_holder"),
    shipToAddress: text("ship_to_address"),
    transporter: text("transporter"),
    otherReferences: text("other_references"),
    msmeUdyamNo: text("msme_udyam_no"),
    // ── GST / commercial (ERP Phase 2 — Customer Master normalization) ──
    gstRegistrationType: gstRegistrationTypeEnum("gst_registration_type"),
    placeOfSupply: text("place_of_supply"),
    isTransporter: boolean("is_transporter").notNull().default(false),
    // ── Customer categorization (Alok 2026-06-17): open, multi-value, optional
    //    tags — "what kind of customer he is" (Mining / Defense / Cutting ). ──
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
    // Additional document/scan URLs beyond the two business-card sides.
    businessCardOtherUrls: text("business_card_other_urls").array(),
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
 * Normalized addresses per client (ERP Phase 2 — Customer Master). The legacy
 * address columns on `clients` stay for back-compat; this child table is the
 * normalized source of truth (registered / bill_to / ship_to / consignee), each
 * optionally flagged primary, ordered by sort_order.
 */
export const clientAddresses = pgTable("client_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  addressType: addressTypeEnum("address_type").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  label: text("label"),
  line1: text("line_1"), line2: text("line_2"), line3: text("line_3"), line4: text("line_4"),
  city: text("city"), state: text("state"), country: text("country"), pinCode: text("pin_code"),
  gstin: text("gstin"), notes: text("notes"), sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("client_addresses_client_idx").on(t.clientId, t.addressType, t.sortOrder)]);
export type ClientAddress = typeof clientAddresses.$inferSelect;
export type NewClientAddress = typeof clientAddresses.$inferInsert;

/**
 * Normalized bank accounts per client (ERP Phase 2 — Customer Master). The
 * legacy 5 bank columns on `clients` stay for back-compat; this child table
 * holds the normalized rows, each optionally flagged primary.
 */
export const clientBankAccounts = pgTable("client_bank_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  isPrimary: boolean("is_primary").notNull().default(false),
  bankName: text("bank_name"), accountNo: text("account_no"), ifsc: text("ifsc"),
  branch: text("branch"), accountHolder: text("account_holder"), accountType: text("account_type"),
  notes: text("notes"), sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("client_bank_accounts_client_idx").on(t.clientId, t.sortOrder)]);
export type ClientBankAccount = typeof clientBankAccounts.$inferSelect;
export type NewClientBankAccount = typeof clientBankAccounts.$inferInsert;

/**
 * Subjects — canonical list backing the "Subject" picker on the task forms.
 * Mirrors the `clients` pattern exactly: an admin/seed-managed list that the
 * New Task / Edit Task dropdowns read from, with an inline "+ Add new
 * subject" affordance open to any authenticated user. Stored on the
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
    // Per-option config (forms/masters redesign — Phase B). For `shape` rows
    // this holds the ShapeConfig (which dimensions are required/optional/hidden)
    // that drives the item & enquiry forms. Generic jsonb so other kinds can
    // carry config later without a migration.
    config: jsonb("config"),
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

/**
 * Per-form "Custom" dropdown lists — form-scoped option lists that do NOT
 * belong in the shared Masters module (e.g. a form's Payment Terms / Freight
 * choices). Keyed by (formKey, listKey); each form's "Custom" sidebar editor
 * manages its own lists. Shared/cross-form lists stay in `master_options`.
 */
export const formCustomOptions = pgTable(
  "form_custom_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Owning form family, e.g. "kyc", "sample" (matches FORM_DRAFT_KINDS).
    formKey: text("form_key").notNull(),
    // The specific list within that form, e.g. "payment_terms", "freight".
    listKey: text("list_key").notNull(),
    label: text("label").notNull(),
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
    uniqueIndex("form_custom_options_key_label_uidx").on(
      t.formKey,
      t.listKey,
      sql`lower(${t.label})`,
    ),
    index("form_custom_options_lookup_idx").on(
      t.formKey,
      t.listKey,
      t.isActive,
      t.sortOrder,
    ),
  ],
);
export type FormCustomOption = typeof formCustomOptions.$inferSelect;
export type NewFormCustomOption = typeof formCustomOptions.$inferInsert;

// ── Inquiry module (Phase 2) ────────────────────────────────────
export const enquiryStatusEnum = pgEnum("enquiry_status", ENQUIRY_STATUSES);
export const feasibilityStatusEnum = pgEnum("feasibility_status", FEASIBILITY_STATUSES);
export const checkStateEnum = pgEnum("check_state", CHECK_STATES);
export const feasVerdictEnum = pgEnum("feas_verdict", FEAS_VERDICTS);
export const recheckStateEnum = pgEnum("recheck_state", RECHECK_STATES);
export const inquiryPriorityEnum = pgEnum("inquiry_priority", INQUIRY_PRIORITIES);
export const inquirySourceEnum = pgEnum("inquiry_source", INQUIRY_SOURCES);
export const feasPriorityEnum = pgEnum("feas_priority", FEAS_PRIORITIES);
export const feasCheckVerdictEnum = pgEnum("feas_check_verdict", FEAS_CHECK_VERDICTS);
export const feasRiskEnum = pgEnum("feas_risk", FEAS_RISKS);

/** SM numbers: SM9579, SM9580,  (observed last manual number SM9578).
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
    // Optional additional contact people (snapshot, beyond the primary above).
    extraContacts: jsonb("extra_contacts").$type<
      Array<{ firstName?: string; lastName?: string; contactNo?: string; email?: string }>
    >(),

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
    // Whether this is the client's first-ever enquiry (Yes/No on the form).
    firstEnquiry: boolean("first_enquiry"),
    // Free-text "what we assumed" per check, filled when a check is marked Assumed.
    assumedValues: jsonb("assumed_values").$type<{
      quantity?: string;
      shapeDimension?: string;
      grade?: string;
      tolerance?: string;
      condition?: string;
    }>(),
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
    departmentId: uuid("department_id").references(() => masterOptions.id, { onDelete: "set null" }),
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
    // General feasibility remarks (beside Actions List).
    feasNotes: text("feas_notes"),
    // Feasibility attachments (drawings, specs, photos) — public blob URLs.
    feasAttachments: jsonb("feas_attachments").$type<Array<{ name: string; url: string }>>(),
    feasibilityCheckedById: uuid("feasibility_checked_by_id").references(() => employees.id, { onDelete: "set null" }),
    feasibilityStatus: feasibilityStatusEnum("feasibility_status").notNull().default("not_started"),

    isArchived: boolean("is_archived").notNull().default(false),

    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inquiries_status_idx").on(t.enquiryStatus, t.enquiryDate),
    index("inquiries_company_idx").on(t.companyName),
    index("inquiries_sales_person_idx").on(t.assignedSalesPersonId),
    index("inquiries_archived_idx").on(t.isArchived),
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
    // Unit the dimension values are expressed in (mm / cm / m / inch).
    dimensionUnit: text("dimension_unit").default("mm"),
    dimensionNotes: text("dimension_notes"),
    gradeId: uuid("grade_id").references(() => masterOptions.id, { onDelete: "set null" }),
    gradeCustomer: text("grade_customer"),
    toleranceId: uuid("tolerance_id").references(() => masterOptions.id, { onDelete: "set null" }),
    conditionId: uuid("condition_id").references(() => masterOptions.id, { onDelete: "set null" }),
    quantityNos: numeric("quantity_nos"),
    quantityUom: text("quantity_uom").notNull().default("Nos"),
    // Per-product enquiry checklist (moved from the inquiry header): each product
    // carries its own Given / Not Given / Assumed marks, assumed-value notes,
    // docs given, sample-received flag, and a free-text description.
    quantityStatus: checkStateEnum("quantity_status"),
    shapeDimensionCheck: checkStateEnum("shape_dimension_check"),
    gradeCheck: checkStateEnum("grade_check"),
    toleranceCheck: checkStateEnum("tolerance_check"),
    conditionCheck: checkStateEnum("condition_check"),
    assumedQuantity: text("assumed_quantity"),
    assumedShapeDimension: text("assumed_shape_dimension"),
    assumedGrade: text("assumed_grade"),
    assumedTolerance: text("assumed_tolerance"),
    assumedCondition: text("assumed_condition"),
    docsGiven: text("docs_given").array(),
    sampleReceived: boolean("sample_received"),
    description: text("description"),
    // FK to the Item / Product Master. SSOT invariant I1 (ERP Phase 4, migration
    // 0034): every product line ALWAYS carries an item_id (a reused/created Item,
    // possibly a draft), written in the same tx as the line. onDelete: restrict —
    // an Item that is referenced by a product can never be deleted (merges
    // repoint, they never blind-delete).
    itemId: uuid("item_id").references(() => items.id, { onDelete: "restrict" }).notNull(),
    // ── Form 04 Technical Review lock gate + 3-tier grades (migration 0062) ──
    // Dimensions/specs must be locked in Feasibility Review before Costing (Form 05)
    // unlocks. Snapshot the PF baseline at lock time for the PF-vs-Costing variance report.
    isDimensionsLocked: boolean("is_dimensions_locked").notNull().default(false),
    lockedById: uuid("locked_by_id").references(() => employees.id, { onDelete: "set null" }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    feasibilityBaseline: jsonb("feasibility_baseline"),
    // ── Feasibility Confirmed gate (per-item, AFTER Lock Dimensions) ──
    // Confirming REQUIRES the line to be locked first (Lock = the Secondary/
    // Technical stage). Only confirmed lines can be costed — this is the strong
    // per-item costing gate that replaces the inquiry-level proceed_to_costing gate.
    // Unlocking a line clears these (a line can't stay confirmed once unlocked).
    feasibilityConfirmed: boolean("feasibility_confirmed").notNull().default(false),
    feasibilityConfirmedById: uuid("feasibility_confirmed_by_id").references(() => employees.id, { onDelete: "set null" }),
    feasibilityConfirmedAt: timestamp("feasibility_confirmed_at", { withTimezone: true }),
    // Grade we give the customer (external_grade master) — distinct from gradeId/gradeCustomer.
    gradeCustomerFacingId: uuid("grade_customer_facing_id").references(() => masterOptions.id, { onDelete: "set null" }),
    // Internal shop-floor production grade (internal_grade master), hidden from customer quotes.
    gradeInternalProductionId: uuid("grade_internal_production_id").references(() => masterOptions.id, { onDelete: "set null" }),
    internalProductionCodeId: uuid("internal_production_code_id").references(() => masterOptions.id, { onDelete: "set null" }),
    partNoId: uuid("part_no_id").references(() => masterOptions.id, { onDelete: "set null" }),
    // ── Secondary / Technical Feasibility (per-item detailed technical spec) ──
    // Sits between Primary Feasibility (the 5-check review + Lock Dimensions) and
    // Confirm. text (not pg enums) for verdict/availability so this stays a clean
    // ADD COLUMN set. Availability fields hold: available / to_be_made / to_procure / na.
    // Verdict holds: feasible / not_feasible / needs_info.
    outerDiaTol: text("outer_dia_tol"),
    innerDiaTol: text("inner_dia_tol"),
    lengthTol: text("length_tol"),
    widthTol: text("width_tol"),
    thicknessTol: text("thickness_tol"),
    secBlockWt: numeric("sec_block_wt"),
    secNetWt: numeric("sec_net_wt"),
    secMaterialWt: numeric("sec_material_wt"),
    secProcessRoute: text("sec_process_route"),
    secToolingAvailability: text("sec_tooling_availability"),
    secMaterialAvailability: text("sec_material_availability"),
    secVerdict: text("sec_verdict"),
    secNotes: text("sec_notes"),
    secondaryFeasibilityDone: boolean("secondary_feasibility_done").notNull().default(false),
    secondaryFeasibilityAt: timestamp("secondary_feasibility_at", { withTimezone: true }),
    secondaryFeasibilityById: uuid("secondary_feasibility_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inquiry_items_inquiry_idx").on(t.inquiryId, t.sortOrder),
    // Where-used graph fan-out (ERP Phase 2 — migration 0032).
    index("inquiry_items_item_idx").on(t.itemId),
  ],
);
export type InquiryItem = typeof inquiryItems.$inferSelect;
export type NewInquiryItem = typeof inquiryItems.$inferInsert;

// ── Per-product primary feasibility (2026-07-12): one verdict row per product ──
export const inquiryItemFeasibility = pgTable(
  "inquiry_item_feasibility",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inquiryItemId: uuid("inquiry_item_id")
      .notNull()
      .references(() => inquiryItems.id, { onDelete: "cascade" }),
    // Original 5 checks (2026-07-12).
    shapeDimVerdict: feasCheckVerdictEnum("shape_dim_verdict"),
    gradeVerdict: feasCheckVerdictEnum("grade_verdict"),
    toleranceVerdict: feasCheckVerdictEnum("tolerance_verdict"),
    conditionVerdict: feasCheckVerdictEnum("condition_verdict"),
    quantityVerdict: feasCheckVerdictEnum("quantity_verdict"),
    shapeDimNote: text("shape_dim_note"),
    gradeNote: text("grade_note"),
    toleranceNote: text("tolerance_note"),
    conditionNote: text("condition_note"),
    quantityNote: text("quantity_note"),
    // Full DFM review dimensions (2026-07-16, migration 0055).
    drawingCompletenessVerdict: feasCheckVerdictEnum("drawing_completeness_verdict"),
    toolingProcessVerdict: feasCheckVerdictEnum("tooling_process_verdict"),
    materialSupplyVerdict: feasCheckVerdictEnum("material_supply_verdict"),
    surfaceFinishVerdict: feasCheckVerdictEnum("surface_finish_verdict"),
    specialProcessVerdict: feasCheckVerdictEnum("special_process_verdict"),
    drawingCompletenessNote: text("drawing_completeness_note"),
    toolingProcessNote: text("tooling_process_note"),
    materialSupplyNote: text("material_supply_note"),
    surfaceFinishNote: text("surface_finish_note"),
    specialProcessNote: text("special_process_note"),
    // Engineer's rolled-up per-product verdict + risk.
    itemVerdict: feasCheckVerdictEnum("item_verdict"),
    itemRiskRating: feasRiskEnum("item_risk_rating"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("inquiry_item_feasibility_item_uidx").on(t.inquiryItemId)],
);
export type InquiryItemFeasibility = typeof inquiryItemFeasibility.$inferSelect;
export type NewInquiryItemFeasibility = typeof inquiryItemFeasibility.$inferInsert;

// ── SM-level primary feasibility review (2026-07-16, migration 0055) ──
// One row per inquiry. The APQP "Team Feasibility Commitment" gate artifact:
// engineer runs the review → submits → an admin approves/rejects to release the
// enquiry to costing. Supersedes the legacy embedded feas* columns on inquiries.
export const inquiryFeasibility = pgTable(
  "inquiry_feasibility",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inquiryId: uuid("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    status: feasibilityStatusEnum("status").notNull().default("not_started"),
    // Rolled-up outcome + APQP risk dimension.
    overallVerdict: feasCheckVerdictEnum("overall_verdict"),
    riskRating: feasRiskEnum("risk_rating"),
    // v2 decision-scorecard roll-up (migration 0056): weighted 0–100 index +
    // count of critical veto blockers. Recomputed server-side by the scoring
    // engine on every save (lib/feasibility/score.ts).
    overallScore: numeric("overall_score"),
    blockerCount: integer("blocker_count").notNull().default(0),
    // SM-level (commercial) checks.
    exportRegulatoryVerdict: feasCheckVerdictEnum("export_regulatory_verdict"),
    exportRegulatoryNote: text("export_regulatory_note"),
    leadTimeVerdict: feasCheckVerdictEnum("lead_time_verdict"),
    leadTimeNote: text("lead_time_note"),
    // Narrative outputs that feed costing / the customer.
    assumptions: text("assumptions"),
    customerClarifications: text("customer_clarifications"),
    actionItems: text("action_items"),
    priority: feasPriorityEnum("priority"),
    export: boolean("export"),
    // Two-role audit trail: engineer submits, admin approves.
    engineerId: uuid("engineer_id").references(() => employees.id, { onDelete: "set null" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approverId: uuid("approver_id").references(() => employees.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvalNote: text("approval_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("inquiry_feasibility_inquiry_uidx").on(t.inquiryId),
    index("inquiry_feasibility_status_idx").on(t.status),
  ],
);
export type InquiryFeasibility = typeof inquiryFeasibility.$inferSelect;
export type NewInquiryFeasibility = typeof inquiryFeasibility.$inferInsert;

// ── Primary Feasibility v2 decision-scorecard (2026-07-16, migration 0056) ──
// Admin-editable dimension catalogue. Seeded from lib/feasibility/dimensions.ts
// (idempotent, scripts/seed-defaults.ts); Carbide's engineers tune weights here.
export const feasibilityDimensions = pgTable(
  "feasibility_dimensions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    hint: text("hint"),
    weight: numeric("weight").notNull().default("0"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("feasibility_dimensions_key_uidx").on(t.key)],
);
export type FeasibilityDimension = typeof feasibilityDimensions.$inferSelect;
export type NewFeasibilityDimension = typeof feasibilityDimensions.$inferInsert;

// One score row per inquiry × dimension. `weightSnapshot` freezes the weight
// used at scoring time so later master edits never silently re-score old jobs.
export const inquiryFeasibilityScores = pgTable(
  "inquiry_feasibility_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inquiryId: uuid("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    dimensionKey: text("dimension_key").notNull(),
    weightSnapshot: numeric("weight_snapshot").notNull().default("0"),
    // 0–100; null = not yet scored (drives Needs-info).
    score: integer("score"),
    risk: feasRiskEnum("risk"),
    isCritical: boolean("is_critical").notNull().default(false),
    // Derived band verdict (persisted for querying/sorting the queue).
    verdict: feasCheckVerdictEnum("verdict"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("inquiry_feasibility_scores_inq_dim_uidx").on(t.inquiryId, t.dimensionKey),
    index("inquiry_feasibility_scores_inquiry_idx").on(t.inquiryId),
  ],
);
export type InquiryFeasibilityScore = typeof inquiryFeasibilityScores.$inferSelect;
export type NewInquiryFeasibilityScore = typeof inquiryFeasibilityScores.$inferInsert;

// ── Item / Product Master (2026-06-17, Alok) ────────────────────
export const costingTypeEnum = pgEnum("costing_type", COSTING_TYPES);

/**
 * Item lifecycle status (ERP Phase 2 — migration 0030). Additive alongside the
 * existing `is_active`/`deleted_at` governance; those stay authoritative this
 * phase (the real cutover to `status` lands in Phase 6). Backfill: active where
 * is_active else archived. `superseded` is reserved for merge-with-history.
 */
export const itemStatusEnum = pgEnum("item_status", ITEM_STATUSES);

/** Item serial → the "10001" in S-10001-C- */
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
    // Sole writer is createItem(), which draws nextval('item_seq_seq') ONCE and
    // supplies both `seq` and the assembled item_code from that single draw — so
    // the two always agree. The column default is a fallback for any future
    // direct insert; never insert an items row without an explicit `seq` from
    // the same draw used to build item_code, or the two will diverge.
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
    sizeCode: text("size_code"),                 // S / M / L  (derived or chosen)
    shapeId: uuid("shape_id").references(() => masterOptions.id, { onDelete: "set null" }),
    internalGradeId: uuid("internal_grade_id").references(() => masterOptions.id, { onDelete: "set null" }),
    toleranceId: uuid("tolerance_id").references(() => masterOptions.id, { onDelete: "set null" }),
    conditionId: uuid("condition_id").references(() => masterOptions.id, { onDelete: "set null" }),
    gradeCustomer: text("grade_customer"),
    gradeNameForCust: text("grade_name_for_cust"),

    // Dimensions + the unit they're expressed in (mm / cm / m / inch).
    outerDia: numeric("outer_dia"), innerDia: numeric("inner_dia"),
    length: numeric("length"), width: numeric("width"), thickness: numeric("thickness"),
    dimensionUnit: text("dimension_unit").default("mm"),
    dimensionNotes: text("dimension_notes"),

    // Part identity + quotation insert lines.
    partNo: text("part_no"),
    partDescription1: text("part_description_1"),
    partDescription2: text("part_description_2"),
    partDescription3: text("part_description_3"),
    partDescription4: text("part_description_4"),
    partTag: text("part_tag"),
    costingType: costingTypeEnum("costing_type"),

    // Item Master completion (ERP Phase 3): HSN code + units of measure.
    hsnCode: text("hsn_code"),
    uom: text("uom").default("Nos"),
    altUom: text("alt_uom"),
    altUomConversion: numeric("alt_uom_conversion"),

    // Lifecycle status (ERP Phase 2 — migration 0030). ADDED alongside the
    // existing is_active/deleted_at governance below — those stay authoritative
    // this phase; the cutover to `status` happens in Phase 6. Backfilled active
    // where is_active else archived. `superseded` reserved for merge-with-history.
    status: itemStatusEnum("status").notNull().default("active"),

    // Item-Sync Contract (ERP Phase 4 — migration 0033). A draft Item is a
    // real, dedup-keyed, searchable row created for an incomplete product spec
    // (shape null OR a shape-required dimension missing). `draftReason` records
    // the gap as "missing:<field,...>" (e.g. "missing:shape" | "missing:outerDia,length");
    // `completedAt` is stamped when the row becomes/starts active. Both nullable
    // and additive — the item_id NOT NULL constraint is a SEPARATE later migration
    // applied only after the total backfill fills every inquiry_items.item_id.
    draftReason: text("draft_reason"),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    // Governance (ERP Phase 4): deactivate-only lifecycle. Items are never
    // hard-deleted; is_active=false + deleted_at marks a retired item.
    isActive: boolean("is_active").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    // PROVENANCE (ERP Phase 2 — migration 0030): write-once "created-from"
    // snapshot of the source enquiry. Backfilled from the existing
    // inquiry_id/sm_number/enquiry_date/customer_name/cust_product_name/qty/
    // created_by_id columns. NEVER queried for usage/dedup/search (Canonical
    // Decisions); legacy cols dropped in Phase 6.
    originInquiryId: uuid("origin_inquiry_id").references(() => inquiries.id, { onDelete: "set null" }),
    originSmNumber: text("origin_sm_number"),
    originEnquiryDate: timestamp("origin_enquiry_date", { withTimezone: true }),
    originCustomerName: text("origin_customer_name"),
    originCustProductName: text("origin_cust_product_name"),
    originQty: numeric("origin_qty"),
    originCreatedById: uuid("origin_created_by_id").references(() => employees.id, { onDelete: "set null" }),

    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("items_dedup_key_uidx").on(t.dedupKey),
    index("items_inquiry_idx").on(t.inquiryId),
    index("items_shape_idx").on(t.shapeId),
    index("items_active_idx").on(t.isActive),
    index("items_status_idx").on(t.status),
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
    // Phase 7 — per-line + per-item lineage so a physical sample ties to the
    // exact enquiry product line and its Item Master row (traceability +
    // where-used). Both nullable + set-null; legacy samples link only inquiryId.
    inquiryItemId: uuid("inquiry_item_id").references(() => inquiryItems.id, { onDelete: "set null" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    // Client-first flow (KYC → Sample → Enquiry): a sample is logged for a
    // client before any enquiry exists, so it links directly to the client.
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    sampleNo: text("sample_no").notNull().unique(),
    location: text("location").notNull().default("AYK Cabin"),
    responsiblePersonId: uuid("responsible_person_id").references(() => employees.id, { onDelete: "set null" }),
    photoUrls: text("photo_urls").array(),
    sampleNotes: text("sample_notes"),
    sampleStatus: sampleStatusEnum("sample_status").notNull().default("received"),
    dimensionStatus: stageStatusEnum("dimension_status").notNull().default("not_started"),
    dimensionLocation: text("dimension_location").notNull().default("Undecided"),
    dimensionCompletedOn: timestamp("dimension_completed_on", { withTimezone: true }),
    dimensionNotes: text("dimension_notes"),
    dimensionAudioUrl: text("dimension_audio_url"),
    chemicalStatus: stageStatusEnum("chemical_status").notNull().default("not_started"),
    chemicalLocation: text("chemical_location").notNull().default("Undecided"),
    chemicalCompletedOn: timestamp("chemical_completed_on", { withTimezone: true }),
    chemicalNotes: text("chemical_notes"),
    chemicalAudioUrl: text("chemical_audio_url"),
    drawingStatus: stageStatusEnum("drawing_status").notNull().default("not_started"),
    drawingLocation: text("drawing_location").notNull().default("Undecided"),
    drawingCompletedOn: timestamp("drawing_completed_on", { withTimezone: true }),
    drawingNotes: text("drawing_notes"),
    drawingAudioUrl: text("drawing_audio_url"),
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
    index("samples_client_idx").on(t.clientId),
    // Phase 7 — sample where-used on the Item + enquiry-line lineage.
    index("samples_item_idx").on(t.itemId),
    index("samples_inquiry_item_idx").on(t.inquiryItemId),
  ],
);
export type Sample = typeof samples.$inferSelect;
export type NewSample = typeof samples.$inferInsert;

// ── Quotation / Negotiation / Sales Order (Phase 4) ─────────────
export const costingDoneStatusEnum = pgEnum("costing_done_status", COSTING_DONE_STATUSES);
export const negotiationStatusEnum = pgEnum("negotiation_status", NEGOTIATION_STATUSES);
export const negotiationStageEnum = pgEnum("negotiation_stage", NEGOTIATION_STAGES);

// ── Costing module (Phase C) ────────────────────────────────────
export const costingRouteEnum = pgEnum("costing_route", COSTING_ROUTES);
export const costingLogicEnum = pgEnum("costing_logic", COSTING_LOGICS);

export const costings = pgTable(
  "costings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inquiryItemId: uuid("inquiry_item_id").notNull().references(() => inquiryItems.id, { onDelete: "cascade" }),
    inquiryId: uuid("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }),
    // Per-item cost history (ERP Phase 2 — migration 0031). Nullable for now;
    // backfilled from inquiry_items.item_id via inquiry_item_id. Becomes the
    // canonical cost anchor (NOT NULL) in a later phase.
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    costingType: costingRouteEnum("costing_type").notNull(),
    costingLogic: costingLogicEnum("costing_logic"),
    isChosen: boolean("is_chosen").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    qty: numeric("qty"),
    // in-house inputs
    toolType: text("tool_type"), toolCostMethod: text("tool_cost_method"), toolFlatCost: numeric("tool_flat_cost"),
    blockWt: numeric("block_wt"), theoreticalWt: numeric("theoretical_wt"), pressingWt: numeric("pressing_wt"),
    weightUsed: text("weight_used"),
    lossPct: numeric("loss_pct"), rmPricePerKg: numeric("rm_price_per_kg"),
    vaPct: numeric("va_pct"), vaFloorPerKg: numeric("va_floor_per_kg"),
    shapingRatePerMin: numeric("shaping_rate_per_min"), shapingMins: numeric("shaping_mins"),
    machiningType: text("machining_type"), machiningRate: numeric("machining_rate"),
    overheadPct: numeric("overhead_pct"), negotiationPct: numeric("negotiation_pct"),
    // bought-out inputs
    outsourcedVendorCost: numeric("outsourced_vendor_cost"), vendorOhPct: numeric("vendor_oh_pct"),
    vendorNotes: text("vendor_notes"), developmentCost: numeric("development_cost"),
    developmentNotes: text("development_notes"), technicalNotes: text("technical_notes"),
    // ── Form 05 weight matrix + single primary BO vendor (migration 0062) ──
    blockWtPerPiece: numeric("block_wt_per_piece"),           // gms
    blockWtOrderKg: numeric("block_wt_order_kg"),             // auto = qty * blockWtPerPiece / 1000
    directWtPerPiece: numeric("direct_wt_per_piece"),         // gms
    directWtOrderKg: numeric("direct_wt_order_kg"),           // auto = qty * directWtPerPiece / 1000
    totalWtOrderKg: numeric("total_wt_order_kg"),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }), // single primary BO vendor
    vendorCodeSnapshot: text("vendor_code_snapshot"),
    vendorQuoteLink: text("vendor_quote_link"),               // Vercel Blob URL, uploaded to SM folder
    paymentTerms: text("payment_terms"),
    // ── Costing Master engine v3 (migration 0064) ──────────────────
    // Data + dropdowns the calculator needs. Sizes are transferred from the
    // Tolerance Calculator / previous sheet (spec §10.2); free text.
    finishedSize: text("finished_size"), toleranceSize: text("tolerance_size"),
    sinteredSize: text("sintered_size"), greenSize: text("green_size"),
    shrinkage: text("shrinkage"),
    // Tooling Chart dropdown (Admin Master `tooling_chart`); Levy method already
    // in toolCostMethod (Flat / Per-Piece / None), flat cost in toolFlatCost.
    toolingChartId: uuid("tooling_chart_id").references((): AnyPgColumn => masterOptions.id, { onDelete: "set null" }),
    toolPerPieceCost: numeric("tool_per_piece_cost"),
    // Which weight-selection method drove Total Weight (spec §3): 1 previously
    // made · 2 tooling available · 3 tooling to be made · 4 no tooling.
    weightMethod: integer("weight_method"),
    // Mandril Cost (spec §10.5) — Rate + Size, both default 0.
    mandrilRate: numeric("mandril_rate"), mandrilSize: numeric("mandril_size"),
    // Machining lines (spec §7). Each selected Admin-Master op carries Minutes +
    // Rate; internal=false means an external vendor does it (vendorId → vendors).
    machiningOps: jsonb("machining_ops").$type<
      Array<{ opId: string; label: string; minutes: number; rate: number; internal: boolean; vendorId?: string }>
    >(),
    // Up to 3–5 external machining vendors, each a flat rate (spec §7).
    externalMachiningVendors: jsonb("external_machining_vendors").$type<
      Array<{ vendorId: string; label: string; rate: number }>
    >(),
    // "Any other Development Cost" repeatable lines (spec §10.5); levy =
    // Flat / Per-Piece / None.
    devCosts: jsonb("dev_costs").$type<
      Array<{ description: string; qty: number; rate: number; amount: number; levy: string }>
    >(),
    // Quantity Tolerance dropdown (Admin Master `quantity_tolerance`, spec §10.8).
    quantityToleranceId: uuid("quantity_tolerance_id").references((): AnyPgColumn => masterOptions.id, { onDelete: "set null" }),
    // computed outputs (snapshot)
    lossWt: numeric("loss_wt"), rmPerGm: numeric("rm_per_gm"), vaPerGm: numeric("va_per_gm"),
    sinteredCostPerGm: numeric("sintered_cost_per_gm"), sinteredPricePerPiece: numeric("sintered_price_per_piece"),
    shapingCostPerPiece: numeric("shaping_cost_per_piece"), machiningCostPerPiece: numeric("machining_cost_per_piece"),
    costAfterMachining: numeric("cost_after_machining"), negotiationAmount: numeric("negotiation_amount"),
    finalCostPerPiece: numeric("final_cost_per_piece"), quoteValue: numeric("quote_value"),
    // ── Form 05 BO-vs-BU dual costing / recommendation / approver override / lock ──
    // (Phase 1, migration 0061). Reuses costingRouteEnum for recommended/approved
    // option so NO `ALTER TYPE ADD VALUE` is emitted (transaction-safe). Decision
    // columns live on the chosen row (Shape A); approver cols mirror inquiryFeasibility.
    recommendedOption: costingRouteEnum("recommended_option"),        // auto-picked lowest overall
    recommendedVendorQuoteId: uuid("recommended_vendor_quote_id"),    // BO vendor behind the recommendation (nullable, no FK — validate in code)
    approvedOption: costingRouteEnum("approved_option"),              // approver's final pick
    chosenVendorQuoteId: uuid("chosen_vendor_quote_id").references((): AnyPgColumn => costingVendorQuotes.id, { onDelete: "set null" }), // winning BO vendor quote
    isOverridden: boolean("is_overridden").notNull().default(false),
    overrideReason: text("override_reason"),
    finalUnitCost: numeric("final_unit_cost"),                       // locked number that feeds Form 06
    approverId: uuid("approver_id").references(() => employees.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    isLocked: boolean("is_locked").notNull().default(false),
    // meta
    developmentTime: text("development_time"), deliveryTime: text("delivery_time"), validity: text("validity"),
    costingDoneStatus: costingDoneStatusEnum("costing_done_status").notNull().default("not_done"),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("costings_inquiry_idx").on(t.inquiryId),
    index("costings_item_idx").on(t.inquiryItemId, t.sortOrder),
    // Where-used graph fan-out on the new item FK (ERP Phase 2 — migration 0032).
    // Note: `costings_item_idx` above is legacy-named on (inquiry_item_id, sort_order).
    index("costings_item_id_idx").on(t.itemId),
  ],
);
export type Costing = typeof costings.$inferSelect;
export type NewCosting = typeof costings.$inferInsert;

// ── Vendor Master (Form 05, migration 0061) ─────────────────────
// Standalone master (mirrors `clients`/`departments`), NOT a masterOptions kind —
// structured commercial terms don't fit config-jsonb. Deactivate-only governance.
/** Vendor codes: VN-0001, VN-0002,  */
export const vendorsVendorCodeSeq = pgSequence("vendors_vendor_code_seq", { startWith: 1 });

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Human code (VN-0001) mirroring clients_client_code_seq.
    vendorCode: text("vendor_code").unique()
      .default(sql`'VN-' || lpad(nextval('vendors_vendor_code_seq')::text, 4, '0')`),
    name: text("name").notNull(),
    contactPerson: text("contact_person"),
    contactNo: text("contact_no"),
    email: text("email"),
    // Legacy free-text address (kept for back-compat with rows created before the
    // structured fields below existed; the form no longer edits it directly).
    address: text("address"),
    // Structured postal address (mirrors clients): four street lines + city +
    // state (INDIAN_STATES) + PIN.
    addressLine1: text("address_line_1"),
    addressLine2: text("address_line_2"),
    addressLine3: text("address_line_3"),
    addressLine4: text("address_line_4"),
    city: text("city"),
    state: text("state"),
    pinCode: text("pin_code"),
    // Default commercial terms the BO matrix pre-fills from.
    defaultCreditDays: integer("default_credit_days"),
    paymentTerms: text("payment_terms"),
    // Toggle for non-GST vendors (migration 0062).
    isGstApplicable: boolean("is_gst_applicable").notNull().default(true),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    // Governance: deactivate-only — vendors are never hard-deleted.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(100),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("vendors_active_sort_idx").on(t.isActive, t.sortOrder, t.name),
    // Case-insensitive uniqueness (mirrors clients_name_lower_uidx).
    uniqueIndex("vendors_name_lower_uidx").on(sql`lower(${t.name})`),
  ],
);
export type Vendor = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;

// ── BO multi-vendor matrix (Form 05, migration 0061) ────────────
// One row per vendor quote under a bought-out costing (≤5 per costing — capped in
// the zod validator, NOT the DB). vendorId is nullable so ad-hoc/one-off vendors
// are allowed; vendorNameSnapshot denormalizes the name at capture time.
export const costingVendorQuotes = pgTable(
  "costing_vendor_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    costingId: uuid("costing_id").notNull().references(() => costings.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    vendorNameSnapshot: text("vendor_name_snapshot"),
    unitPrice: numeric("unit_price").notNull(),
    leadTimeDays: integer("lead_time_days"),
    creditPeriodDays: integer("credit_period_days"),
    freightCost: numeric("freight_cost"),          // per ORDER (divided by qty for landed cost/pc)
    vendorOhPct: numeric("vendor_oh_pct"),
    developmentCost: numeric("development_cost"),
    // landed cost/pc = unitPrice + unitPrice*vendorOhPct + developmentCost + freightCost/qty
    // Per-vendor commercial terms (previously held at the costing level for BO;
    // now captured per competing vendor quote). Master-id fields point at the
    // payment_term / quantity_tolerance masters; delivery/validity are a number +
    // a days|weeks unit. `notes` above stays SHARED across the matrix.
    paymentTermsId: uuid("payment_terms_id").references(() => masterOptions.id, { onDelete: "set null" }),
    quantityToleranceId: uuid("quantity_tolerance_id").references(() => masterOptions.id, { onDelete: "set null" }),
    deliveryTime: numeric("delivery_time"),
    deliveryTimeUnit: text("delivery_time_unit"),   // days | weeks
    validity: numeric("validity"),
    validityUnit: text("validity_unit"),            // days | weeks
    sortOrder: integer("sort_order").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("costing_vendor_quotes_costing_idx").on(t.costingId, t.sortOrder)],
);
export type CostingVendorQuote = typeof costingVendorQuotes.$inferSelect;
export type NewCostingVendorQuote = typeof costingVendorQuotes.$inferInsert;

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

export const quotationItems = pgTable(
  "quotation_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quotationId: uuid("quotation_id").notNull().references(() => quotations.id, { onDelete: "cascade" }),
    inquiryItemId: uuid("inquiry_item_id").references(() => inquiryItems.id, { onDelete: "set null" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    // SPEC / customer-ask mirror columns REMOVED in ERP Phase 6 (migration 0036):
    // cust_product_name, cust_drawing_no, drawing_revision_no, grade_customer,
    // grade_name_for_cust, tolerance, condition, part_no. Spec resolves
    // read-through from `items` via item_id; customer-ask via the provenance
    // inquiry_item (lib/flow/spec-resolve.ts). Only transactional facts remain.
    qty: numeric("qty"),
    finalCost: numeric("final_cost"),
    negotiation: numeric("negotiation"),
    quotePrice: numeric("quote_price"),
    developmentTime: text("development_time"),
    deliveryTime: text("delivery_time"),
    validity: text("validity"),
    // Legal commercial snapshot (ERP Phase 6 — migration 0035, §2.4). NULL while
    // the quotation is a draft (drafts read through live); frozen ONLY at the
    // sent transition by the Phase-8 handler. `unitPrice` = the price the
    // counterparty relied on; `specSnapshot` = the frozen spec jsonb for legal
    // PDF reproduction so a later re-classification never alters a sent quote.
    unitPrice: numeric("unit_price"),
    specSnapshot: jsonb("spec_snapshot"),
    frozenAt: timestamp("frozen_at", { withTimezone: true }),
    frozenBy: uuid("frozen_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("quotation_items_quotation_idx").on(t.quotationId, t.sortOrder),
    // Where-used graph fan-out (ERP Phase 2 — migration 0032).
    index("quotation_items_item_idx").on(t.itemId),
  ],
);
export type QuotationItem = typeof quotationItems.$inferSelect;
export type NewQuotationItem = typeof quotationItems.$inferInsert;

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
  // Proforma Invoice pipeline (2026-08-02). `negotiationStage` is the linear PI
  // lifecycle (Quote Send → PI Issued → Negotiation Awarded → Customer PO
  // Received); `piIterationCount` tracks how many PIs have been issued so the
  // next PI number is `<SM>-PI##`. The customerPo* columns capture the received
  // customer purchase order; `poMatchStatus` records the PI↔PO reconciliation
  // (matched | mismatch | unchecked, nullable).
  negotiationStage: negotiationStageEnum("negotiation_stage").notNull().default("quote_send"),
  piIterationCount: integer("pi_iteration_count").notNull().default(0),
  customerPoNo: text("customer_po_no"),
  customerPoDate: timestamp("customer_po_date", { withTimezone: true }),
  customerPoLink: text("customer_po_link"),
  customerPoRemarks: text("customer_po_remarks"),
  poMatchStatus: text("po_match_status"),
  createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("negotiations_inquiry_idx").on(t.inquiryId), index("negotiations_status_idx").on(t.negotiationStatus)]);
export type Negotiation = typeof negotiations.$inferSelect;
export type NewNegotiation = typeof negotiations.$inferInsert;

export const negotiationItems = pgTable(
  "negotiation_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    negotiationId: uuid("negotiation_id").notNull().references(() => negotiations.id, { onDelete: "cascade" }),
    inquiryItemId: uuid("inquiry_item_id").references(() => inquiryItems.id, { onDelete: "set null" }),
    quotationItemId: uuid("quotation_item_id").references(() => quotationItems.id, { onDelete: "set null" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    // SPEC / customer-ask mirror columns REMOVED in ERP Phase 6 (migration 0036):
    // cust_product_name, part_no. Resolved read-through from items (item_id) +
    // provenance inquiry_item. Only transactional facts remain.
    qty: numeric("qty"),
    finalCost: numeric("final_cost"),
    negotiation: numeric("negotiation"),
    quotePrice: numeric("quote_price"),
    developmentTime: text("development_time"),
    deliveryTime: text("delivery_time"),
    validity: text("validity"),
    // Legal commercial snapshot (ERP Phase 6 — migration 0035, §2.4). NULL until
    // the negotiation round is agreed (verbal_yes); the agreed `unitPrice` is a
    // fact of that round. `specSnapshot`/`frozenAt`/`frozenBy` mirror the quote
    // line's freeze shape so all commercial lines share one snapshot contract.
    unitPrice: numeric("unit_price"),
    specSnapshot: jsonb("spec_snapshot"),
    frozenAt: timestamp("frozen_at", { withTimezone: true }),
    frozenBy: uuid("frozen_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("negotiation_items_negotiation_idx").on(t.negotiationId, t.sortOrder),
    // Where-used graph fan-out (ERP Phase 2 — migration 0032).
    index("negotiation_items_item_idx").on(t.itemId),
  ],
);
export type NegotiationItem = typeof negotiationItems.$inferSelect;
export type NewNegotiationItem = typeof negotiationItems.$inferInsert;

// ── Proforma Invoice (2026-08-02) ───────────────────────────────
// A PI sits between negotiation and the customer PO. Each negotiation can issue
// several PIs across revisions (`iteration`, numbered `<SM>-PI##`); the customer
// signs off a PI, then sends their PO which is reconciled against it. `status`
// is plain text (draft | issued | superseded | accepted) so the lifecycle can
// flex without a schema change.
export const proformaInvoices = pgTable(
  "proforma_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    negotiationId: uuid("negotiation_id").notNull().references(() => negotiations.id, { onDelete: "cascade" }),
    quotationId: uuid("quotation_id").references(() => quotations.id, { onDelete: "set null" }),
    inquiryId: uuid("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }),
    piNo: text("pi_no").unique(),
    iteration: integer("iteration").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    issuedById: uuid("issued_by_id").references(() => employees.id, { onDelete: "set null" }),
    developmentTime: text("development_time"),
    deliveryTime: text("delivery_time"),
    validity: text("validity"),
    revisedTotal: numeric("revised_total"),
    notes: text("notes"),
    pdfLink: text("pdf_link"),
    status: text("status").notNull().default("draft"),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("proforma_invoices_negotiation_idx").on(t.negotiationId),
    index("proforma_invoices_inquiry_idx").on(t.inquiryId),
  ],
);
export type ProformaInvoice = typeof proformaInvoices.$inferSelect;
export type NewProformaInvoice = typeof proformaInvoices.$inferInsert;

export const proformaInvoiceItems = pgTable(
  "proforma_invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proformaInvoiceId: uuid("proforma_invoice_id").notNull().references(() => proformaInvoices.id, { onDelete: "cascade" }),
    negotiationItemId: uuid("negotiation_item_id").references(() => negotiationItems.id, { onDelete: "set null" }),
    quotationItemId: uuid("quotation_item_id").references(() => quotationItems.id, { onDelete: "set null" }),
    inquiryItemId: uuid("inquiry_item_id"),
    itemId: uuid("item_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    custProductName: text("cust_product_name"),
    qty: numeric("qty"),
    partNo: text("part_no"),
    revisedUnitPrice: numeric("revised_unit_price"),
    revisedLineTotal: numeric("revised_line_total"),
    notes: text("notes"),
  },
  (t) => [
    index("proforma_invoice_items_pi_idx").on(t.proformaInvoiceId, t.sortOrder),
  ],
);
export type ProformaInvoiceItem = typeof proformaInvoiceItems.$inferSelect;
export type NewProformaInvoiceItem = typeof proformaInvoiceItems.$inferInsert;

export const salesOrders = pgTable("sales_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  inquiryId: uuid("inquiry_id").notNull().references(() => inquiries.id, { onDelete: "cascade" }),
  quotationId: uuid("quotation_id").references(() => quotations.id, { onDelete: "set null" }),
  // Phase 7 (§11 / DoD #9) — closes the negotiation→SO referential break. The
  // SO now carries the negotiation it was won from (order_won auto-provisions a
  // draft SO by reference in Phase 8). Nullable + set-null: legacy SOs and
  // direct-PO SOs have no negotiation; deleting a negotiation never orphans a SO.
  negotiationId: uuid("negotiation_id").references(() => negotiations.id, { onDelete: "set null" }),
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
  // System-generated processing stamp (2026-08-02) — e.g. "Okay for processing"
  // written when the SO is confirmed / handed to production.
  systemRemark: text("system_remark"),
  createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("sales_orders_inquiry_idx").on(t.inquiryId),
  // Phase 7 — negotiation→SO lineage lookup.
  index("sales_orders_negotiation_idx").on(t.negotiationId),
]);
export type SalesOrder = typeof salesOrders.$inferSelect;
export type NewSalesOrder = typeof salesOrders.$inferInsert;

export const salesOrderItems = pgTable(
  "sales_order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    salesOrderId: uuid("sales_order_id").notNull().references(() => salesOrders.id, { onDelete: "cascade" }),
    inquiryItemId: uuid("inquiry_item_id").references(() => inquiryItems.id, { onDelete: "set null" }),
    quotationItemId: uuid("quotation_item_id").references(() => quotationItems.id, { onDelete: "set null" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    // SPEC / customer-ask mirror columns REMOVED in ERP Phase 6 (migration 0036):
    // cust_product_name, part_no. Resolved read-through from items (item_id) +
    // provenance inquiry_item. Only transactional facts remain.
    qty: numeric("qty"),
    quotePrice: numeric("quote_price"),
    developmentTime: text("development_time"),
    deliveryTime: text("delivery_time"),
    validity: text("validity"),
    // Legal commercial snapshot (ERP Phase 6 — migration 0035, §2.4). NULL until
    // the SO is confirmed; the order is a contract so price, spec AND the ordered
    // quantity are frozen at confirmation. `qtyOrdered` is the SO line's legit
    // qty snapshot (distinct from the JC release qty on job_cards.qty_ordered).
    unitPrice: numeric("unit_price"),
    specSnapshot: jsonb("spec_snapshot"),
    qtyOrdered: numeric("qty_ordered"),
    frozenAt: timestamp("frozen_at", { withTimezone: true }),
    frozenBy: uuid("frozen_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sales_order_items_so_idx").on(t.salesOrderId, t.sortOrder),
    // Where-used graph fan-out (ERP Phase 2 — migration 0032).
    index("sales_order_items_item_idx").on(t.itemId),
  ],
);
export type SalesOrderItem = typeof salesOrderItems.$inferSelect;
export type NewSalesOrderItem = typeof salesOrderItems.$inferInsert;

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

// ── Job Card (production work order — 2026-06-30) ───────────────────────────
// The core production entity (legacy ERP has 12,500+). Mostly free-text +
// numeric snapshots taken at issue time; optional links back to the sales
// order, client and item it was raised from. Governance pattern mirrors
// items/sales_orders (deactivate-only: is_active=false + deleted_at).
export const jobCards = pgTable(
  "job_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // User-entered work-order number (e.g. "8191A"). Unique case-insensitively
    // via the lower() expression index below.
    jobCardNo: text("job_card_no").notNull(),
    jobCardDate: timestamp("job_card_date", { withTimezone: true }),
    oaNo: text("oa_no"), // Order Acknowledgement no.

    // Optional links + snapshots (snapshots survive source edits/deletes).
    salesOrderId: uuid("sales_order_id").references(() => salesOrders.id, { onDelete: "set null" }),
    // Phase 7 (§10.5) — line-level lineage so a JC resolves qty/customer/spec
    // live from its SO line (not the free-text snapshots below) and walks the
    // provenance chain back to the enquiry line. Both nullable + set-null: legacy
    // JCs and ad-hoc production have no line lineage. `qtyOrdered` is the JC's
    // released quantity against the SO line (partial/split releases).
    salesOrderItemId: uuid("sales_order_item_id").references(() => salesOrderItems.id, { onDelete: "set null" }),
    inquiryItemId: uuid("inquiry_item_id").references(() => inquiryItems.id, { onDelete: "set null" }),
    qtyOrdered: numeric("qty_ordered"),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    customerName: text("customer_name"),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    productCode: text("product_code"), // snapshot of item_code
    productName: text("product_name"),

    diaSize: text("dia_size"),
    punchSize: text("punch_size"),
    proposedSize: text("proposed_size"),

    gradeName: text("grade_name"),
    gradeColour: text("grade_colour"),

    deliveryDate: timestamp("delivery_date", { withTimezone: true }),

    weight: numeric("weight"),
    heightMin: numeric("height_min"),
    heightMax: numeric("height_max"),
    orderQuantity: numeric("order_quantity"),
    plannedQtyToPress: numeric("planned_qty_to_press"),

    dispatchConditionId: uuid("dispatch_condition_id").references(() => masterOptions.id, { onDelete: "set null" }),
    toleranceId: uuid("tolerance_id").references(() => masterOptions.id, { onDelete: "set null" }),
    pressingTypeId: uuid("pressing_type_id").references(() => masterOptions.id, { onDelete: "set null" }),

    ypNo: text("yp_no"),
    supportSizeTop: text("support_size_top"),
    supportSizeBottom: text("support_size_bottom"),

    makeSampleForSintering: boolean("make_sample_for_sintering"),
    outsource: boolean("outsource"),
    supplierVendorName: text("supplier_vendor_name"),
    process: text("process"),

    prevWeight: numeric("prev_weight"),
    prevPressure: text("prev_pressure"),
    prevGradeName: text("prev_grade_name"),

    remarks: text("remarks"),

    // Governance (deactivate-only lifecycle).
    isActive: boolean("is_active").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("job_cards_job_card_no_uidx").on(sql`lower(${t.jobCardNo})`),
    index("job_cards_client_idx").on(t.clientId),
    index("job_cards_item_idx").on(t.itemId),
    index("job_cards_active_idx").on(t.isActive),
    // Phase 7 — SO-line → JC lookup (release tracking + workspace lineage).
    index("job_cards_so_item_idx").on(t.salesOrderItemId),
    index("job_cards_inquiry_item_idx").on(t.inquiryItemId),
  ],
);
export type JobCard = typeof jobCards.$inferSelect;
export type NewJobCard = typeof jobCards.$inferInsert;

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
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    jobCardId: uuid("job_card_id").references(() => jobCards.id, { onDelete: "set null" }),
    // Phase 7 (§11 / §13) — polymorphic FKs to the three downstream entities so
    // a document (PO route sheet, e-way bill, tax invoice PDF, delivery note) is
    // filed against the record it belongs to. Forward refs (tables defined below)
    // via the AnyPgColumn pattern. `templateVersion` records the print-template
    // era a rendered statutory doc used, so re-rendering a historical invoice/DN
    // never applies a modern template (§13 template versioning).
    productionOrderId: uuid("production_order_id").references((): AnyPgColumn => productionOrders.id, { onDelete: "set null" }),
    dispatchId: uuid("dispatch_id").references((): AnyPgColumn => dispatches.id, { onDelete: "set null" }),
    invoiceId: uuid("invoice_id").references((): AnyPgColumn => invoices.id, { onDelete: "set null" }),
    templateVersion: text("template_version"),
    uploadedById: uuid("uploaded_by_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("documents_created_idx").on(t.createdAt),
    index("documents_task_idx").on(t.taskId),
    index("documents_client_idx").on(t.clientId),
    index("documents_item_idx").on(t.itemId),
    index("documents_job_card_idx").on(t.jobCardId),
    index("documents_production_order_idx").on(t.productionOrderId),
    index("documents_dispatch_idx").on(t.dispatchId),
    index("documents_invoice_idx").on(t.invoiceId),
  ],
);

// ── Audit trail (ERP Phase 1) ───────────────────────────────────────────────
// Generic append-only change history. Legally-required (India Companies Act).
// No FK on entity_id (polymorphic across any entity); actor_id FKs employees
// but is nullable + set-null so deleting an employee never loses the trail.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    entityLabel: text("entity_label"),
    action: auditActionEnum("action").notNull(),
    actorId: uuid("actor_id").references(() => employees.id, { onDelete: "set null" }),
    actorName: text("actor_name"),
    changes: jsonb("changes").$type<Array<{ field: string; old: unknown; new: unknown }>>(),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId, t.createdAt),
    index("audit_log_actor_idx").on(t.actorId),
  ],
);
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;

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
    // ERP Phase 8 — per-entity enforced-workflow feature flags. Key = a
    // WORKFLOW_FLAG_KEY ("quotation" | "negotiation" | "sales_order" | ...);
    // value true means `advanceStage` enforcement + form redirects are ON for
    // that entity. Absent/false = OFF (the DEFAULT), and the app behaves exactly
    // as pre-Phase-8 (independent New forms + free-set status dropdowns). Read
    // server-side via lib/workflow/flags.ts; never hardcode a flag on. The empty
    // object default means every flag defaults OFF, so the deploy is a no-op.
    workflowFlags: jsonb("workflow_flags")
      .notNull()
      .$type<Record<string, boolean>>()
      .default({}),
    // Company & Legal (admin -> Company & Legal). The legal entity + bank used
    // on quotations, invoices and official documents.
    legalName: text("legal_name"),
    gstin: text("gstin"),
    panNo: text("pan_no"),
    cin: text("cin"),
    regAddress: text("reg_address"),
    regCity: text("reg_city"),
    regState: text("reg_state"),
    regPincode: text("reg_pincode"),
    bankName: text("bank_name"),
    bankAccountNo: text("bank_account_no"),
    bankIfsc: text("bank_ifsc"),
    bankBranch: text("bank_branch"),
    // Document numbering config (admin -> Document Numbering). Per doc-type
    // { prefix, next } counters. Absent keys fall back to the built-in scheme.
    docNumbering: jsonb("doc_numbering")
      .notNull()
      .$type<Record<string, { prefix: string; next: number }>>()
      .default({}),
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

/**
 * Roles (ERP redesign — Phase 1). The seven canonical actors of the sales →
 * production pipeline: `sales, costing, production, qc, dispatch, accounts,
 * admin`. Seeded (idempotent, by name) via `scripts/seed-defaults.ts`. Admin
 * implies every role in the enforcement layer (`lib/auth/roles.ts`).
 *
 * ADDITIVE / non-breaking: until a person is granted rows in `employee_roles`,
 * `userRoles()` falls back to `["admin"]` when `employees.is_admin` is true, so
 * nothing in the pre-rollout app changes.
 */
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("roles_sort_idx").on(t.sortOrder, t.name)],
);

/**
 * Employee ↔ role grants (many-to-many). Mirrors the `employee_departments`
 * join style. A missing row-set means "fall back to is_admin" (see roles doc);
 * the data-fill in seed-defaults grants every admin the `admin` role.
 */
export const employeeRoles = pgTable(
  "employee_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("employee_roles_employee_role_uidx").on(t.employeeId, t.roleId),
    index("employee_roles_employee_idx").on(t.employeeId),
    index("employee_roles_role_idx").on(t.roleId),
  ],
);

/**
 * Saved views (ERP redesign — Phase 1 backend; the SavedViews bar UI lands in
 * Phase 3). A per-employee (optionally shared) named bundle of filters/sort/
 * columns for a register module ("items", "clients", "enquiries", ). `config`
 * is opaque jsonb the consuming register interprets.
 */
export const savedViews = pgTable(
  "saved_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    module: text("module").notNull(),
    name: text("name").notNull(),
    config: jsonb("config").notNull().default({}),
    isShared: boolean("is_shared").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(100),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("saved_views_module_employee_idx").on(t.module, t.employeeId),
  ],
);

/**
 * Auto-saved form drafts. A per-user store of half-filled forms (the New
 * Enquiry form to start; `form_key` keeps it reusable for other forms). The
 * raw react-hook-form values live in `payload` (partial, unvalidated); `label`
 * is a derived one-line summary for the Drafts list. Deleted on final submit.
 */
export const formDrafts = pgTable(
  "form_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    formKey: text("form_key").notNull().default("enquiry"),
    payload: jsonb("payload").notNull().default({}),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Recycle Bin: when set, the draft is soft-deleted (recycled) at this time.
    // Recycled either manually or by the 10-draft-per-form cap; purged 48h later.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("form_drafts_owner_form_updated_idx").on(t.ownerId, t.formKey, t.updatedAt),
    index("form_drafts_owner_deleted_idx").on(t.ownerId, t.deletedAt),
  ],
);

export type FormDraft = typeof formDrafts.$inferSelect;
export type NewFormDraft = typeof formDrafts.$inferInsert;

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
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
export type EmployeeRole = typeof employeeRoles.$inferSelect;
export type NewEmployeeRole = typeof employeeRoles.$inferInsert;
export type SavedView = typeof savedViews.$inferSelect;
export type NewSavedView = typeof savedViews.$inferInsert;

// ════════════════════════════════════════════════════════════════════════════
// Phase 7 — Production, Dispatch & Invoice/GST (the make-to-order tail, §11)
// ADDITIVE ONLY. New downstream entities + supporting masters. Follows house
// conventions: uuid pk defaultRandom, snake_case columns / camelCase fields,
// created_at/updated_at, deactivate-or-set-null onDelete, seq-based human
// numbers. Gapless FY-scoped invoice/DN numbers are allocated by
// lib/series/next-number.ts against the doc_number_series counter table below
// (NOT a plain sequence — gapless requires a FOR UPDATE counter row per FY).
// ════════════════════════════════════════════════════════════════════════════

export const productionOrderStatusEnum = pgEnum("production_order_status", PRODUCTION_ORDER_STATUSES);
export const productionOpStatusEnum = pgEnum("production_op_status", PRODUCTION_OP_STATUSES);
export const productionQcResultEnum = pgEnum("production_qc_result", PRODUCTION_QC_RESULTS);
export const rmLotStatusEnum = pgEnum("rm_lot_status", RM_LOT_STATUSES);
export const dispatchStatusEnum = pgEnum("dispatch_status", DISPATCH_STATUSES);
export const invoiceStatusEnum = pgEnum("invoice_status", INVOICE_STATUSES);
export const gstSupplyTypeEnum = pgEnum("gst_supply_type", GST_SUPPLY_TYPES);
export const paymentModeEnum = pgEnum("payment_mode", PAYMENT_MODES);

/** Human production-order number → "PO-10001". */
export const productionOrderNoSeq = pgSequence("production_order_no_seq", { startWith: 10001 });

/**
 * §11.1 — Production order. The shop-floor work order for one SO line. Anchored
 * on `item_id` (NOT NULL — you always make a known Item) with optional links to
 * the SO line / job card / SO it was raised from. `scrapQty`/`yieldPct`/`actual*`
 * are the feedback edge to costing (actuals vs estimate) — a nullable link +
 * notes, NOT a rewrite of the costing engine.
 */
export const productionOrders = pgTable(
  "production_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poNo: text("po_no").notNull().unique().default(sql`'PO-' || nextval('production_order_no_seq')`),
    salesOrderId: uuid("sales_order_id").references(() => salesOrders.id, { onDelete: "set null" }),
    salesOrderItemId: uuid("sales_order_item_id").references(() => salesOrderItems.id, { onDelete: "set null" }),
    jobCardId: uuid("job_card_id").references(() => jobCards.id, { onDelete: "set null" }),
    itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
    status: productionOrderStatusEnum("status").notNull().default("planned"),
    qtyPlanned: numeric("qty_planned"),
    qtyProduced: numeric("qty_produced"),
    // Feedback-to-costing edge (§11.1). Real scrap/yield/actual RM feed the JC's
    // "avg scrap %" + future estimates. `costingId` is the estimate this actual
    // reconciles against (nullable — not every PO has a costing row).
    scrapQty: numeric("scrap_qty"),
    yieldPct: numeric("yield_pct"),
    actualRmKg: numeric("actual_rm_kg"),
    costingId: uuid("costing_id").references(() => costings.id, { onDelete: "set null" }),
    costFeedbackNotes: text("cost_feedback_notes"),
    plannedStartDate: timestamp("planned_start_date", { withTimezone: true }),
    plannedEndDate: timestamp("planned_end_date", { withTimezone: true }),
    actualStartDate: timestamp("actual_start_date", { withTimezone: true }),
    actualEndDate: timestamp("actual_end_date", { withTimezone: true }),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("production_orders_item_idx").on(t.itemId),
    index("production_orders_so_idx").on(t.salesOrderId),
    index("production_orders_so_item_idx").on(t.salesOrderItemId),
    index("production_orders_job_card_idx").on(t.jobCardId),
    index("production_orders_status_idx").on(t.status),
    index("production_orders_costing_idx").on(t.costingId),
  ],
);
export type ProductionOrder = typeof productionOrders.$inferSelect;
export type NewProductionOrder = typeof productionOrders.$inferInsert;

/** §11.1 — routing ops per production order (name frozen: production_ops). */
export const productionOps = pgTable(
  "production_ops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productionOrderId: uuid("production_order_id").notNull().references(() => productionOrders.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    opName: text("op_name").notNull(),
    workCenter: text("work_center"),
    status: productionOpStatusEnum("status").notNull().default("pending"),
    plannedMins: numeric("planned_mins"),
    actualMins: numeric("actual_mins"),
    operatorId: uuid("operator_id").references(() => employees.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("production_ops_order_idx").on(t.productionOrderId, t.sortOrder)],
);
export type ProductionOp = typeof productionOps.$inferSelect;
export type NewProductionOp = typeof productionOps.$inferInsert;

/**
 * §11.1 — raw-material heat/batch lot (15-year traceability). One row per
 * received lot of a grade from a supplier; `qtyRemainingKg` decrements as
 * production_consumption rows are written.
 */
export const rmLots = pgTable(
  "rm_lots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lotNo: text("lot_no").notNull(),
    heatNo: text("heat_no"),
    grade: text("grade"),
    internalGradeId: uuid("internal_grade_id").references(() => masterOptions.id, { onDelete: "set null" }),
    supplierName: text("supplier_name"),
    qtyReceivedKg: numeric("qty_received_kg"),
    qtyRemainingKg: numeric("qty_remaining_kg"),
    unitCostPerKg: numeric("unit_cost_per_kg"),
    receivedDate: timestamp("received_date", { withTimezone: true }),
    status: rmLotStatusEnum("status").notNull().default("available"),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("rm_lots_lot_no_uidx").on(sql`lower(${t.lotNo})`),
    index("rm_lots_grade_idx").on(t.internalGradeId),
    index("rm_lots_status_idx").on(t.status),
  ],
);
export type RmLot = typeof rmLots.$inferSelect;
export type NewRmLot = typeof rmLots.$inferInsert;

/** §11.1 — the lot→order RM consumption join (traceability edge). */
export const productionConsumption = pgTable(
  "production_consumption",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productionOrderId: uuid("production_order_id").notNull().references(() => productionOrders.id, { onDelete: "cascade" }),
    productionOpId: uuid("production_op_id").references(() => productionOps.id, { onDelete: "set null" }),
    rmLotId: uuid("rm_lot_id").notNull().references(() => rmLots.id, { onDelete: "restrict" }),
    qtyConsumedKg: numeric("qty_consumed_kg").notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("production_consumption_order_idx").on(t.productionOrderId),
    index("production_consumption_lot_idx").on(t.rmLotId),
  ],
);
export type ProductionConsumption = typeof productionConsumption.$inferSelect;
export type NewProductionConsumption = typeof productionConsumption.$inferInsert;

/** §11.1 — per-lot / per-order QC check + result. */
export const productionQc = pgTable(
  "production_qc",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productionOrderId: uuid("production_order_id").notNull().references(() => productionOrders.id, { onDelete: "cascade" }),
    rmLotId: uuid("rm_lot_id").references(() => rmLots.id, { onDelete: "set null" }),
    checkName: text("check_name").notNull(),
    result: productionQcResultEnum("result").notNull().default("pending"),
    measuredValue: text("measured_value"),
    spec: text("spec"),
    checkedById: uuid("checked_by_id").references(() => employees.id, { onDelete: "set null" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("production_qc_order_idx").on(t.productionOrderId),
    index("production_qc_lot_idx").on(t.rmLotId),
  ],
);
export type ProductionQc = typeof productionQc.$inferSelect;
export type NewProductionQc = typeof productionQc.$inferInsert;

// ── Dispatch / Delivery Note (§11.2) ─────────────────────────────────────────
/**
 * §11.2 — dispatch / delivery note. `dnNo` is a GAPLESS FY-scoped number
 * allocated by lib/series/next-number.ts at issue (NOT a plain sequence — a DN
 * register is statutory and must be gapless per FY). Draft dispatches carry a
 * NULL dnNo until issued. e-way-bill fields are phase-2 optional.
 */
export const dispatches = pgTable(
  "dispatches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // NULL while draft; set to the gapless FY number at the issue transition.
    dnNo: text("dn_no").unique(),
    fyLabel: text("fy_label"), // e.g. "2026-27" — the FY the dnNo belongs to.
    dispatchDate: timestamp("dispatch_date", { withTimezone: true }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    salesOrderId: uuid("sales_order_id").references(() => salesOrders.id, { onDelete: "set null" }),
    status: dispatchStatusEnum("status").notNull().default("draft"),
    // Logistics.
    vehicleNo: text("vehicle_no"),
    transporterName: text("transporter_name"),
    lrNo: text("lr_no"),
    // e-Way bill (§11.2 phase-2 optional).
    ewayBillNo: text("eway_bill_no"),
    ewayBillDate: timestamp("eway_bill_date", { withTimezone: true }),
    shipToAddress: text("ship_to_address"),
    notes: text("notes"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    issuedById: uuid("issued_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("dispatches_client_idx").on(t.clientId),
    index("dispatches_so_idx").on(t.salesOrderId),
    index("dispatches_status_idx").on(t.status),
    // Gapless-series lookup (per-FY max) — see lib/series/next-number.ts.
    index("dispatches_fy_idx").on(t.fyLabel),
  ],
);
export type Dispatch = typeof dispatches.$inferSelect;
export type NewDispatch = typeof dispatches.$inferInsert;

export const dispatchLines = pgTable(
  "dispatch_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dispatchId: uuid("dispatch_id").notNull().references(() => dispatches.id, { onDelete: "cascade" }),
    salesOrderItemId: uuid("sales_order_item_id").references(() => salesOrderItems.id, { onDelete: "set null" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    // "what shipped" traces to "what produced it" (§11.2).
    productionOrderId: uuid("production_order_id").references(() => productionOrders.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    qtyDispatched: numeric("qty_dispatched").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("dispatch_lines_dispatch_idx").on(t.dispatchId, t.sortOrder),
    index("dispatch_lines_item_idx").on(t.itemId),
    index("dispatch_lines_so_item_idx").on(t.salesOrderItemId),
  ],
);
export type DispatchLine = typeof dispatchLines.$inferSelect;
export type NewDispatchLine = typeof dispatchLines.$inferInsert;

// ── Invoice / GST (§11.3) ────────────────────────────────────────────────────
/**
 * §11.3 — tax invoice. `invoiceNo` is a GAPLESS FY-scoped number (India
 * statutory) allocated by lib/series/next-number.ts at the issue transition;
 * NULL while draft. `supplyType` (intra/inter/export) is the CGST/SGST vs IGST
 * pivot, derived from placeOfSupply vs the seller state (lib/gst/compute.ts).
 * Header totals are COMPUTED but PERSISTED (legal, §11.3). Lines freeze at issue.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceNo: text("invoice_no").unique(),
    fyLabel: text("fy_label"),
    invoiceDate: timestamp("invoice_date", { withTimezone: true }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    salesOrderId: uuid("sales_order_id").references(() => salesOrders.id, { onDelete: "set null" }),
    dispatchId: uuid("dispatch_id").references(() => dispatches.id, { onDelete: "set null" }),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    // GST determination (§11.3).
    placeOfSupply: text("place_of_supply"),
    sellerState: text("seller_state"),
    supplyType: gstSupplyTypeEnum("supply_type"),
    isInterState: boolean("is_inter_state"),
    sellerGstin: text("seller_gstin"),
    buyerGstin: text("buyer_gstin"),
    // Persisted computed totals (legal). Sum of line taxable / tax / totals.
    subTotal: numeric("sub_total"),
    cgstTotal: numeric("cgst_total"),
    sgstTotal: numeric("sgst_total"),
    igstTotal: numeric("igst_total"),
    taxTotal: numeric("tax_total"),
    grandTotal: numeric("grand_total"),
    roundOff: numeric("round_off"),
    amountPaid: numeric("amount_paid").notNull().default("0"),
    // e-invoice / IRN lifecycle (§11.3 phase-2 fields present now).
    irn: text("irn"),
    irnAckNo: text("irn_ack_no"),
    irnAckDate: timestamp("irn_ack_date", { withTimezone: true }),
    templateVersion: text("template_version"),
    notes: text("notes"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    issuedById: uuid("issued_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("invoices_client_idx").on(t.clientId),
    index("invoices_so_idx").on(t.salesOrderId),
    index("invoices_status_idx").on(t.status),
    index("invoices_fy_idx").on(t.fyLabel),
  ],
);
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

/**
 * §11.3 — invoice line, frozen at issue (§2.4). Carries the CGST/SGST/IGST rate
 * + amount split per line. `hsnCode`/`unitPrice`/`taxRate`/`lineTotal`/
 * `specSnapshot` are legal freezes — a statutory doc reproduces exactly forever.
 */
export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    salesOrderItemId: uuid("sales_order_item_id").references(() => salesOrderItems.id, { onDelete: "set null" }),
    dispatchLineId: uuid("dispatch_line_id").references(() => dispatchLines.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    // Frozen line facts (legal).
    description: text("description"),
    hsnCode: text("hsn_code"),
    uom: text("uom").default("Nos"),
    qty: numeric("qty").notNull(),
    unitPrice: numeric("unit_price").notNull(),
    // Taxable value = qty*unitPrice - discount (persisted, not recomputed on read).
    discount: numeric("discount").notNull().default("0"),
    taxableValue: numeric("taxable_value").notNull(),
    // GST split (§11.3). Rates are % (e.g. 9 for 9%); amounts are ₹. Intra-state
    // populates cgst+sgst (igst 0); inter-state populates igst (cgst+sgst 0).
    taxRate: numeric("tax_rate").notNull().default("0"),
    cgstRate: numeric("cgst_rate").notNull().default("0"),
    cgstAmount: numeric("cgst_amount").notNull().default("0"),
    sgstRate: numeric("sgst_rate").notNull().default("0"),
    sgstAmount: numeric("sgst_amount").notNull().default("0"),
    igstRate: numeric("igst_rate").notNull().default("0"),
    igstAmount: numeric("igst_amount").notNull().default("0"),
    lineTotal: numeric("line_total").notNull(),
    specSnapshot: jsonb("spec_snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("invoice_lines_invoice_idx").on(t.invoiceId, t.sortOrder),
    index("invoice_lines_item_idx").on(t.itemId),
  ],
);
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type NewInvoiceLine = typeof invoiceLines.$inferInsert;

/**
 * §11.3 — credit note against an invoice (returns / rate adjustments /
 * cancellation). Gapless FY-scoped number like the invoice; carries its own GST
 * split totals so a reversal is itself a compliant document.
 */
export const creditNotes = pgTable(
  "credit_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creditNoteNo: text("credit_note_no").unique(),
    fyLabel: text("fy_label"),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    creditNoteDate: timestamp("credit_note_date", { withTimezone: true }),
    reason: text("reason"),
    supplyType: gstSupplyTypeEnum("supply_type"),
    subTotal: numeric("sub_total"),
    cgstTotal: numeric("cgst_total"),
    sgstTotal: numeric("sgst_total"),
    igstTotal: numeric("igst_total"),
    taxTotal: numeric("tax_total"),
    grandTotal: numeric("grand_total"),
    notes: text("notes"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("credit_notes_invoice_idx").on(t.invoiceId),
    index("credit_notes_client_idx").on(t.clientId),
    index("credit_notes_fy_idx").on(t.fyLabel),
  ],
);
export type CreditNote = typeof creditNotes.$inferSelect;
export type NewCreditNote = typeof creditNotes.$inferInsert;

/**
 * §11.3 — payment / receipt recorded against an invoice. Powers the Client
 * Workspace "Outstanding" (invoice.grand_total − Σ payments) in Phase 8/9.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    amount: numeric("amount").notNull(),
    mode: paymentModeEnum("mode").notNull().default("neft"),
    reference: text("reference"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => employees.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_client_idx").on(t.clientId),
  ],
);
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

/**
 * §11.3 — GAPLESS FY-scoped document-number counter. One row per (seriesKey, fy)
 * — e.g. ("invoice","2026-27"), ("dn","2026-27"), ("credit_note","2026-27").
 * lib/series/next-number.ts increments `lastValue` inside a tx with a
 * `SELECT  FOR UPDATE` on this row, so concurrent allocations serialize and
 * NEVER skip a number (unlike a Postgres sequence, which leaks on rollback).
 * `prefix` + `padTo` + the current fy assemble the formatted human number.
 */
export const docNumberSeries = pgTable(
  "doc_number_series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seriesKey: text("series_key").notNull(), // "invoice" | "dn" | "credit_note"
    fyLabel: text("fy_label").notNull(),     // "2026-27"
    prefix: text("prefix").notNull().default(""),
    padTo: integer("pad_to").notNull().default(4),
    lastValue: integer("last_value").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("doc_number_series_key_fy_uidx").on(t.seriesKey, t.fyLabel),
  ],
);
export type DocNumberSeries = typeof docNumberSeries.$inferSelect;
export type NewDocNumberSeries = typeof docNumberSeries.$inferInsert;
