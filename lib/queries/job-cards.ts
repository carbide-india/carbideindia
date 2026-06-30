import "server-only";
import { aliasedTable, and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, items, jobCards, masterOptions } from "@/db/schema";
import type { JobCard } from "@/db/schema";

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
  isActive: boolean;
  createdAt: Date;
}

/**
 * Job Card register list — joins the three master FK columns
 * (dispatch condition / pressing type / tolerance) to their names so the table
 * can render without round-trips. Newest-first; table filters client-side.
 */
export async function listJobCards(): Promise<JobCardListItem[]> {
  const dispatch = aliasedTable(masterOptions, "mo_dispatch");
  const pressing = aliasedTable(masterOptions, "mo_pressing");
  const tolerance = aliasedTable(masterOptions, "mo_tolerance");

  return db
    .select({
      id: jobCards.id,
      jobCardNo: jobCards.jobCardNo,
      jobCardDate: jobCards.jobCardDate,
      oaNo: jobCards.oaNo,
      customerName: jobCards.customerName,
      productCode: jobCards.productCode,
      productName: jobCards.productName,
      diaSize: jobCards.diaSize,
      punchSize: jobCards.punchSize,
      proposedSize: jobCards.proposedSize,
      gradeName: jobCards.gradeName,
      gradeColour: jobCards.gradeColour,
      deliveryDate: jobCards.deliveryDate,
      orderQuantity: jobCards.orderQuantity,
      plannedQtyToPress: jobCards.plannedQtyToPress,
      dispatchConditionName: dispatch.name,
      pressingTypeName: pressing.name,
      toleranceName: tolerance.name,
      isActive: jobCards.isActive,
      createdAt: jobCards.createdAt,
    })
    .from(jobCards)
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
          customerName: items.customerName,
          gradeName: grade.name,
          toleranceId: items.toleranceId,
          outerDia: items.outerDia,
          innerDia: items.innerDia,
          length: items.length,
          width: items.width,
          thickness: items.thickness,
          qty: items.qty,
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
