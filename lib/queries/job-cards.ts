import "server-only";
import { aliasedTable, and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  clients,
  items,
  jobCards,
  masterOptions,
  salesOrders,
  salesOrderItems,
} from "@/db/schema";
import type { JobCard } from "@/db/schema";
import {
  resolveSpecsByItemId,
  type ResolvedSpec,
  EMPTY_SPEC,
} from "@/lib/flow/spec-resolve";

/** One row for the /job-cards register table (snapshot + resolved master names). */
export interface JobCardListItem {
  id: string;
  jobCardNo: string;
  jobCardDate: Date | null;
  oaNo: string | null;
  customerName: string | null;
  productCode: string | null;
  productName: string | null;
  diaSize: string | null;
  punchSize: string | null;
  proposedSize: string | null;
  gradeName: string | null;
  gradeColour: string | null;
  deliveryDate: Date | null;
  orderQuantity: string | null;
  plannedQtyToPress: string | null;
  dispatchConditionName: string | null;
  pressingTypeName: string | null;
  toleranceName: string | null;
  // Raw editable fields so a row click can re-hydrate the whole form (not just
  // the snapshot text) — otherwise saving an edit could blank these.
  clientId: string | null;
  itemId: string | null;
  dispatchConditionId: string | null;
  toleranceId: string | null;
  pressingTypeId: string | null;
  weight: string | null;
  heightMin: string | null;
  heightMax: string | null;
  ypNo: string | null;
  supportSizeTop: string | null;
  supportSizeBottom: string | null;
  makeSampleForSintering: boolean | null;
  outsource: boolean | null;
  supplierVendorName: string | null;
  process: string | null;
  prevWeight: string | null;
  prevPressure: string | null;
  prevGradeName: string | null;
  remarks: string | null;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Job Card register list. `customerName` / `productCode` / `gradeName` are
 * resolved READ-THROUGH from the linked Client + Item (§2.4) — the job_cards
 * mirror columns for those are no longer read for display. The three job-card
 * master FKs (dispatch condition / pressing type / tolerance) resolve to their
 * names as before. `productName`/`gradeColour`/`diaSize`/`proposedSize` remain
 * job-card-local process fields (no Item spec source). Newest-first; the table
 * filters client-side. The remaining raw editable columns are returned so a row
 * click can rehydrate the workbench form (write-path round-trip).
 */
export async function listJobCards(): Promise<JobCardListItem[]> {
  const dispatch = aliasedTable(masterOptions, "mo_dispatch");
  const pressing = aliasedTable(masterOptions, "mo_pressing");
  const tolerance = aliasedTable(masterOptions, "mo_tolerance");
  const grade = aliasedTable(masterOptions, "mo_grade");

  return db
    .select({
      id: jobCards.id,
      jobCardNo: jobCards.jobCardNo,
      jobCardDate: jobCards.jobCardDate,
      oaNo: jobCards.oaNo,
      // Read-through: customer from the linked Client, product code + grade from
      // the linked Item (falling back to nothing rather than the mirror column).
      customerName: clients.name,
      productCode: items.itemCode,
      productName: jobCards.productName,
      diaSize: jobCards.diaSize,
      punchSize: jobCards.punchSize,
      proposedSize: jobCards.proposedSize,
      gradeName: grade.name,
      gradeColour: jobCards.gradeColour,
      deliveryDate: jobCards.deliveryDate,
      orderQuantity: jobCards.orderQuantity,
      plannedQtyToPress: jobCards.plannedQtyToPress,
      dispatchConditionName: dispatch.name,
      pressingTypeName: pressing.name,
      toleranceName: tolerance.name,
      clientId: jobCards.clientId,
      itemId: jobCards.itemId,
      dispatchConditionId: jobCards.dispatchConditionId,
      toleranceId: jobCards.toleranceId,
      pressingTypeId: jobCards.pressingTypeId,
      weight: jobCards.weight,
      heightMin: jobCards.heightMin,
      heightMax: jobCards.heightMax,
      ypNo: jobCards.ypNo,
      supportSizeTop: jobCards.supportSizeTop,
      supportSizeBottom: jobCards.supportSizeBottom,
      makeSampleForSintering: jobCards.makeSampleForSintering,
      outsource: jobCards.outsource,
      supplierVendorName: jobCards.supplierVendorName,
      process: jobCards.process,
      prevWeight: jobCards.prevWeight,
      prevPressure: jobCards.prevPressure,
      prevGradeName: jobCards.prevGradeName,
      remarks: jobCards.remarks,
      isActive: jobCards.isActive,
      createdAt: jobCards.createdAt,
    })
    .from(jobCards)
    .leftJoin(clients, eq(jobCards.clientId, clients.id))
    .leftJoin(items, eq(jobCards.itemId, items.id))
    .leftJoin(grade, eq(items.internalGradeId, grade.id))
    .leftJoin(dispatch, eq(jobCards.dispatchConditionId, dispatch.id))
    .leftJoin(pressing, eq(jobCards.pressingTypeId, pressing.id))
    .leftJoin(tolerance, eq(jobCards.toleranceId, tolerance.id))
    .orderBy(desc(jobCards.createdAt));
}

/** Full job-card row by id — for the detail/edit page. */
export async function getJobCard(id: string): Promise<JobCard | null> {
  const [row] = await db
    .select()
    .from(jobCards)
    .where(eq(jobCards.id, id))
    .limit(1);
  return row ?? null;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Job Card Workspace (ERP redesign — Phase 9b, §10)
 *
 * The split-workspace read model: the LEFT pane's job-execution facts come off
 * the `job_cards` row itself; the RIGHT pane's PRODUCT SUMMARY is resolved
 * LIVE from the linked Item (SSOT, via `resolveSpecsByItemId` — §2.4 read-
 * through) plus the exact Sales-Order line that spawned the job (customer +
 * ordered qty from `sales_order_items → sales_orders → clients`, never the
 * job-card mirror columns). "Previous job cards for this item" is the direct
 * where-used slice (other job_cards.item_id === this item).
 * ────────────────────────────────────────────────────────────────────────── */

/** The resolved SO-line context for a job card (customer + ordered qty, live). */
export interface JobCardSalesOrderContext {
  salesOrderItemId: string;
  salesOrderId: string | null;
  soNo: string | null;
  clientName: string | null;
  /** SO-line qty (transactional) + frozen qtyOrdered snapshot where present. */
  lineQty: string | null;
  qtyOrdered: string | null;
  sortOrder: number | null;
}

/** One sibling job card that also references this item (where-used slice). */
export interface JobCardSibling {
  id: string;
  jobCardNo: string;
  jobCardDate: Date | null;
  oaNo: string | null;
  plannedQtyToPress: string | null;
  orderQuantity: string | null;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Everything the Job Card Workspace renders. `card` is the raw editable row
 * (LEFT pane + edit round-trip); `spec` is the LIVE item-resolved product
 * summary (RIGHT pane) — `null` when the card has no `item_id`. Master NAMES for
 * the job card's own three FKs (dispatch / pressing / tolerance) resolve here so
 * the LEFT pane shows labels not ids. `salesOrder` carries live customer + qty;
 * `siblings` is the item's other job cards; `itemGradeColour`/`itemShapeName`
 * decorate the product header.
 */
export interface JobCardWorkspaceData {
  card: JobCard;
  clientName: string | null;
  dispatchConditionName: string | null;
  pressingTypeName: string | null;
  toleranceName: string | null;
  /** Live product spec resolved from the linked Item (null if unlinked). */
  spec: ResolvedSpec | null;
  salesOrder: JobCardSalesOrderContext | null;
  siblings: JobCardSibling[];
}

/**
 * Assemble the Job Card Workspace read model in a handful of scoped queries:
 *   1. the raw job-card row + its own master-name joins (dispatch/pressing/
 *      tolerance) + linked client name,
 *   2. the LIVE item spec (read-through `resolveSpecsByItemId`),
 *   3. the SO-line context (customer + ordered qty) when the JC is line-linked,
 *   4. the item's OTHER job cards (previous-JCs-for-this-item where-used).
 * Returns `null` when the id doesn't resolve.
 */
export async function getJobCardWorkspace(
  id: string,
): Promise<JobCardWorkspaceData | null> {
  const dispatch = aliasedTable(masterOptions, "wsp_mo_dispatch");
  const pressing = aliasedTable(masterOptions, "wsp_mo_pressing");
  const tolerance = aliasedTable(masterOptions, "wsp_mo_tolerance");

  const [row] = await db
    .select({
      card: jobCards,
      clientName: clients.name,
      dispatchConditionName: dispatch.name,
      pressingTypeName: pressing.name,
      toleranceName: tolerance.name,
    })
    .from(jobCards)
    .leftJoin(clients, eq(jobCards.clientId, clients.id))
    .leftJoin(dispatch, eq(jobCards.dispatchConditionId, dispatch.id))
    .leftJoin(pressing, eq(jobCards.pressingTypeId, pressing.id))
    .leftJoin(tolerance, eq(jobCards.toleranceId, tolerance.id))
    .where(eq(jobCards.id, id))
    .limit(1);

  if (!row) return null;

  const card = row.card;

  // ── LIVE product spec from the linked Item (read-through SSOT). ──
  let spec: ResolvedSpec | null = null;
  if (card.itemId) {
    const map = await resolveSpecsByItemId([card.itemId]);
    spec = map.get(card.itemId) ?? { ...EMPTY_SPEC, itemId: card.itemId };
  }

  // ── SO-line context: live customer + ordered qty from the linked line. ──
  let salesOrder: JobCardSalesOrderContext | null = null;
  if (card.salesOrderItemId) {
    const [soRow] = await db
      .select({
        salesOrderItemId: salesOrderItems.id,
        salesOrderId: salesOrders.id,
        soNo: salesOrders.soNo,
        companyName: salesOrders.companyName,
        lineQty: salesOrderItems.qty,
        qtyOrdered: salesOrderItems.qtyOrdered,
        sortOrder: salesOrderItems.sortOrder,
      })
      .from(salesOrderItems)
      .leftJoin(salesOrders, eq(salesOrderItems.salesOrderId, salesOrders.id))
      .where(eq(salesOrderItems.id, card.salesOrderItemId))
      .limit(1);
    if (soRow) {
      salesOrder = {
        salesOrderItemId: soRow.salesOrderItemId,
        salesOrderId: soRow.salesOrderId,
        soNo: soRow.soNo,
        // Customer for the pane: prefer the JC's own linked Client (SSOT
        // for who this job is for); fall back to the SO's company-name text.
        clientName: row.clientName ?? soRow.companyName,
        lineQty: soRow.lineQty,
        qtyOrdered: soRow.qtyOrdered,
        sortOrder: soRow.sortOrder,
      };
    }
  }

  // ── Previous job cards for THIS item (direct where-used slice). ──
  let siblings: JobCardSibling[] = [];
  if (card.itemId) {
    siblings = await db
      .select({
        id: jobCards.id,
        jobCardNo: jobCards.jobCardNo,
        jobCardDate: jobCards.jobCardDate,
        oaNo: jobCards.oaNo,
        plannedQtyToPress: jobCards.plannedQtyToPress,
        orderQuantity: jobCards.orderQuantity,
        isActive: jobCards.isActive,
        createdAt: jobCards.createdAt,
      })
      .from(jobCards)
      .where(and(eq(jobCards.itemId, card.itemId), ne(jobCards.id, card.id)))
      .orderBy(desc(jobCards.createdAt))
      .limit(50);
  }

  return {
    card,
    clientName: row.clientName,
    dispatchConditionName: row.dispatchConditionName,
    pressingTypeName: row.pressingTypeName,
    toleranceName: row.toleranceName,
    spec,
    salesOrder,
    siblings,
  };
}

export interface JobCardPickerClient {
  id: string;
  name: string;
  city: string | null;
  gstin: string | null;
  state: string | null;
}

export interface JobCardPickerItem {
  id: string;
  itemCode: string;
  customerName: string | null;
  gradeName: string | null;
  toleranceId: string | null;
  outerDia: string | null;
  innerDia: string | null;
  length: string | null;
  width: string | null;
  thickness: string | null;
  qty: string | null;
}

export interface MasterOptionItem {
  id: string;
  name: string;
}

export interface JobCardPickerData {
  clients: JobCardPickerClient[];
  items: JobCardPickerItem[];
  dispatchConditions: MasterOptionItem[];
  pressingTypes: MasterOptionItem[];
  tolerances: MasterOptionItem[];
}

/** Active options for one master kind, ordered by sortOrder then name. */
async function activeMasters(
  kind: "dispatch_condition" | "pressing_type" | "tolerance",
): Promise<MasterOptionItem[]> {
  return db
    .select({ id: masterOptions.id, name: masterOptions.name })
    .from(masterOptions)
    .where(and(eq(masterOptions.kind, kind), eq(masterOptions.isActive, true)))
    .orderBy(asc(masterOptions.sortOrder), asc(masterOptions.name));
}

/**
 * Everything a Job Card form needs to populate its pickers and auto-fill from a
 * selected client/item: active clients, active items (with their resolved
 * grade name and the dimension/tolerance/qty fields the UI copies onto a job
 * card), and the three master dropdowns. Active rows only.
 */
export async function getJobCardPickerData(): Promise<JobCardPickerData> {
  const grade = aliasedTable(masterOptions, "mo_grade");

  const [clientRows, itemRows, dispatchConditions, pressingTypes, tolerances] =
    await Promise.all([
      db
        .select({
          id: clients.id,
          name: clients.name,
          city: clients.city,
          gstin: clients.gstin,
          state: clients.state,
        })
        .from(clients)
        .where(eq(clients.isActive, true))
        .orderBy(asc(clients.sortOrder), asc(clients.name)),
      db
        .select({
          id: items.id,
          itemCode: items.itemCode,
          // Provenance display-only "created-from" customer (origin column) —
          // shown purely as picker context, never queried for search/usage.
          customerName: items.originCustomerName,
          gradeName: grade.name,
          toleranceId: items.toleranceId,
          outerDia: items.outerDia,
          innerDia: items.innerDia,
          length: items.length,
          width: items.width,
          thickness: items.thickness,
          qty: items.originQty,
        })
        .from(items)
        .leftJoin(grade, eq(items.internalGradeId, grade.id))
        .where(eq(items.isActive, true))
        .orderBy(desc(items.createdAt), desc(items.seq)),
      activeMasters("dispatch_condition"),
      activeMasters("pressing_type"),
      activeMasters("tolerance"),
    ]);

  return {
    clients: clientRows,
    items: itemRows,
    dispatchConditions,
    pressingTypes,
    tolerances,
  };
}
