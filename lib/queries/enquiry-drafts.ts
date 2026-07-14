import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { formDrafts } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import {
  deriveDraftLabel,
  draftCompleteness,
  draftProductCount,
  type EnquiryDraftPayload,
} from "@/lib/drafts/enquiry-draft";

export interface EnquiryDraftListItem {
  id: string;
  label: string;
  productCount: number;
  completeness: number;
  updatedAt: Date;
}

/** The current user's New-Enquiry drafts, newest first, with derived summaries. */
export async function listEnquiryDrafts(): Promise<EnquiryDraftListItem[]> {
  const me = await requireUser();
  const rows = await db
    .select()
    .from(formDrafts)
    .where(and(eq(formDrafts.ownerId, me.id), eq(formDrafts.formKey, "enquiry")))
    .orderBy(desc(formDrafts.updatedAt));

  return rows.map((r) => {
    const p = (r.payload ?? {}) as EnquiryDraftPayload;
    return {
      id: r.id,
      label: r.label?.trim() || deriveDraftLabel(p),
      productCount: draftProductCount(p),
      completeness: draftCompleteness(p),
      updatedAt: r.updatedAt,
    };
  });
}

/** A single draft's raw form payload - only if it belongs to the current user. */
export async function getEnquiryDraft(id: string): Promise<EnquiryDraftPayload | null> {
  const me = await requireUser();
  const rows = await db
    .select({ payload: formDrafts.payload })
    .from(formDrafts)
    .where(and(eq(formDrafts.id, id), eq(formDrafts.ownerId, me.id), eq(formDrafts.formKey, "enquiry")))
    .limit(1);
  return (rows[0]?.payload as EnquiryDraftPayload | undefined) ?? null;
}
