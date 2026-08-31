/**
 * The sales pipeline as an ordered list of modules.
 *
 * One registry, three consumers, so they can never disagree:
 *   • the "Go to next module" button in each module sidebar,
 *   • the admin rights panel (which module/sub-section a role may enter),
 *   • any future breadcrumb or progress rail.
 *
 * Order is Manan's pipeline exactly:
 *   Client KYC → Sample Register → New Enquiry → Primary Feasibility →
 *   Secondary Feasibility → Costing → Quotation → Negotiation → Sales Order
 *
 * Pure (no React, no db, no server-only) so the client sidebar and the server
 * layout share it.
 */

export interface PipelineModule {
  /** Stable key — stored nowhere, but used in props and tests. Never rename. */
  key: string;
  label: string;
  /** Where "go here" lands. */
  href: string;
  /**
   * The permission that lets someone ENTER the module at all. Deliberately the
   * `.view` key where one exists: entering is reading. Editing inside is gated
   * separately by the matching `.manage` / `.approve` key.
   */
  viewPermission: string;
  /** The key that allows creating/editing inside the module. */
  managePermission: string;
  /** Route prefixes that mean "you are currently in this module". */
  match: string[];
}

export const PIPELINE_MODULES: readonly PipelineModule[] = [
  {
    key: "kyc",
    label: "Client KYC",
    href: "/clients",
    viewPermission: "clients.view",
    managePermission: "clients.manage",
    match: ["/clients"],
  },
  {
    key: "sample",
    label: "Sample Register",
    href: "/samples",
    viewPermission: "samples.view",
    managePermission: "samples.manage",
    match: ["/samples"],
  },
  {
    key: "enquiry",
    label: "New Enquiry",
    href: "/enquiries/new",
    viewPermission: "enquiries.view",
    managePermission: "enquiries.manage",
    // The enquiry family spans both segments (legacy /inquiries register).
    match: ["/enquiries", "/inquiries"],
  },
  {
    key: "primary-feasibility",
    label: "Primary Feasibility",
    href: "/feasibility",
    viewPermission: "feasibility.view",
    managePermission: "feasibility.manage",
    match: ["/feasibility"],
  },
  {
    key: "secondary-feasibility",
    label: "Secondary Feasibility",
    href: "/secondary-feasibility",
    viewPermission: "feasibility.view",
    managePermission: "feasibility.manage",
    match: ["/secondary-feasibility"],
  },
  {
    key: "costing",
    label: "Costing",
    href: "/costings",
    viewPermission: "costing.view",
    managePermission: "costing.manage",
    match: ["/costings"],
  },
  {
    key: "quotation",
    label: "Quotation",
    href: "/quotations",
    viewPermission: "quotations.view",
    managePermission: "quotations.manage",
    match: ["/quotations"],
  },
  {
    key: "negotiation",
    label: "Negotiation",
    href: "/negotiations",
    viewPermission: "negotiations.view",
    managePermission: "negotiations.manage",
    match: ["/negotiations"],
  },
  {
    key: "sales-order",
    label: "Sales Order",
    href: "/sales-orders",
    viewPermission: "sales_orders.view",
    managePermission: "sales_orders.manage",
    match: ["/sales-orders"],
  },
  // Client Meeting and Vendors are not sales-pipeline STAGES (one is an
  // "anytime" log, the other a master), but the Forms launchpad numbers them
  // 10 and 11 in the same sequence — so the sidebar "next module" walk continues
  // into them rather than dead-ending on Sales Order. They keep the same
  // `<seg>.view` / `<seg>.manage` naming as the stages above; those two keys are
  // not in the enforcement catalogue (db/enums.ts) yet, so if permission
  // enforcement is ever switched on they'd be skipped from the walk — which is
  // exactly today's behaviour for them, so no regression, only an improvement
  // while enforcement is off (the app's default).
  {
    key: "meeting",
    label: "Client Meeting",
    href: "/meetings",
    viewPermission: "meetings.view",
    managePermission: "meetings.manage",
    match: ["/meetings"],
  },
  {
    key: "vendors",
    label: "Vendors",
    href: "/vendors",
    viewPermission: "vendors.view",
    managePermission: "vendors.manage",
    match: ["/vendors"],
  },
];

/**
 * Which module a path belongs to. Longest prefix wins, so /secondary-feasibility
 * is never mistaken for /feasibility.
 */
export function moduleForPath(pathname: string): PipelineModule | null {
  let best: PipelineModule | null = null;
  let bestLen = -1;
  for (const m of PIPELINE_MODULES) {
    for (const p of m.match) {
      if ((pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}?`)) && p.length > bestLen) {
        best = m;
        bestLen = p.length;
      }
    }
  }
  return best;
}

/**
 * The next module in the pipeline the viewer is allowed to enter, skipping any
 * they cannot. Returns null at the end of the pipeline, or when nothing further
 * is permitted — the button then renders nothing rather than a dead end.
 *
 * `allowed` is the set of permission keys the viewer holds. Pass null to mean
 * "enforcement is off" (everyone may go anywhere), which is what the app does
 * until an admin turns enforcement on.
 */
export function nextModuleFor(
  pathname: string,
  allowed: ReadonlySet<string> | null,
): PipelineModule | null {
  const current = moduleForPath(pathname);
  const startAt = current
    ? PIPELINE_MODULES.findIndex((m) => m.key === current.key) + 1
    : 0;
  for (let i = startAt; i < PIPELINE_MODULES.length; i++) {
    const m = PIPELINE_MODULES[i]!;
    if (allowed === null || allowed.has(m.viewPermission)) return m;
  }
  return null;
}

/**
 * The PREVIOUS module the viewer is allowed to enter — the mirror of
 * `nextModuleFor`, so someone can walk the pipeline back to check what came
 * before without going via the Hub.
 *
 * Returns null at the head of the pipeline. Off-pipeline paths return null too
 * (not the last module): "back" from somewhere that isn't a stage has no
 * meaning, whereas "forward" sensibly starts at the first stage.
 */
export function prevModuleFor(
  pathname: string,
  allowed: ReadonlySet<string> | null,
): PipelineModule | null {
  const current = moduleForPath(pathname);
  if (!current) return null;
  const startAt = PIPELINE_MODULES.findIndex((m) => m.key === current.key) - 1;
  for (let i = startAt; i >= 0; i--) {
    const m = PIPELINE_MODULES[i]!;
    if (allowed === null || allowed.has(m.viewPermission)) return m;
  }
  return null;
}

/** Every module the viewer may enter, in pipeline order. */
export function allowedModules(
  allowed: ReadonlySet<string> | null,
): PipelineModule[] {
  if (allowed === null) return [...PIPELINE_MODULES];
  return PIPELINE_MODULES.filter((m) => allowed.has(m.viewPermission));
}
