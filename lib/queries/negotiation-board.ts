import "server-only";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employees,
  inquiries,
  negotiationRemarks,
  negotiations,
} from "@/db/schema";
import type { LostReason, NegotiationStatus } from "@/db/enums";

/**
 * The Negotiation board's rows.
 *
 * A board card needs three things the register row does not carry: when the
 * deal was last actually worked (the ageing views are computed from it), the SM
 * number (how everyone here refers to a deal), and the latest remark — the board
 * is useless if you have to open a card to find out what was last said.
 */
export interface NegotiationBoardCard {
  id: string;
  negotiationNo: string;
  smNumber: string | null;
  companyName: string | null;
  salesPersonName: string | null;
  negotiationStatus: NegotiationStatus;
  /** Σ(quote price × qty) — what is on the table, in rupees. */
  quotedValue: number;
  lastActivityAt: Date;
  lostReason: LostReason | null;
  /** Newest remark on the deal, for the card face. */
  latestRemark: string | null;
  latestRemarkAt: Date | null;
  latestRemarkBy: string | null;
  remarkCount: number;
}

const valueSql = sql<string>`coalesce(${negotiations.quotePrice}, 0) * coalesce(${negotiations.qty}, 0)`;

export async function listNegotiationBoard(): Promise<NegotiationBoardCard[]> {
  const rows = await db
    .select({
      id: negotiations.id,
      negotiationNo: negotiations.negotiationNo,
      smNumber: inquiries.smNumber,
      companyName: negotiations.companyName,
      salesPersonName: employees.name,
      negotiationStatus: negotiations.negotiationStatus,
      quotedValue: valueSql,
      lastActivityAt: negotiations.lastActivityAt,
      lostReason: negotiations.lostReason,
    })
    .from(negotiations)
    .leftJoin(inquiries, eq(negotiations.inquiryId, inquiries.id))
    .leftJoin(employees, eq(negotiations.salesPersonId, employees.id))
    .orderBy(desc(negotiations.lastActivityAt));

  if (rows.length === 0) return [];

  // One extra query for the newest remark per deal, rather than N+1 from the
  // board. Read newest-first and keep the first hit per negotiation.
  const ids = rows.map((r) => r.id);
  const remarks = await db
    .select({
      negotiationId: negotiationRemarks.negotiationId,
      body: negotiationRemarks.body,
      createdAt: negotiationRemarks.createdAt,
      authorName: employees.name,
    })
    .from(negotiationRemarks)
    .leftJoin(employees, eq(negotiationRemarks.authorId, employees.id))
    .where(inArray(negotiationRemarks.negotiationId, ids))
    .orderBy(desc(negotiationRemarks.createdAt));

  const latest = new Map<string, (typeof remarks)[number]>();
  const counts = new Map<string, number>();
  for (const r of remarks) {
    if (!latest.has(r.negotiationId)) latest.set(r.negotiationId, r);
    counts.set(r.negotiationId, (counts.get(r.negotiationId) ?? 0) + 1);
  }

  return rows.map((r) => {
    const top = latest.get(r.id);
    const n = Number(r.quotedValue ?? 0);
    return {
      id: r.id,
      negotiationNo: r.negotiationNo,
      smNumber: r.smNumber,
      companyName: r.companyName,
      salesPersonName: r.salesPersonName,
      negotiationStatus: r.negotiationStatus,
      quotedValue: Number.isFinite(n) ? n : 0,
      lastActivityAt: r.lastActivityAt,
      lostReason: r.lostReason,
      latestRemark: top?.body ?? null,
      latestRemarkAt: top?.createdAt ?? null,
      latestRemarkBy: top?.authorName ?? null,
      remarkCount: counts.get(r.id) ?? 0,
    };
  });
}
