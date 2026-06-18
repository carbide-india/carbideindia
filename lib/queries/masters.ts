import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { masterOptions, type MasterOption } from "@/db/schema";
import type { MasterKind } from "@/db/enums";
import { CACHE_TAGS } from "@/lib/cache-tags";

export interface MasterOptionItem {
  id: string;
  name: string;
}

/**
 * Active options for one kind — feeds the KYC / inquiry form dropdowns.
 * Cached under `masters`; writers (`createMasterOption`, `updateMasterOption`)
 * already invalidate that tag. `kind` is part of the cache key (the
 * dashboard-style closure-per-call pattern) so kinds don't collide.
 */
export async function listMasterOptions(
  kind: MasterKind,
): Promise<MasterOptionItem[]> {
  return unstable_cache(
    async (): Promise<MasterOptionItem[]> => {
      return db
        .select({ id: masterOptions.id, name: masterOptions.name })
        .from(masterOptions)
        .where(and(eq(masterOptions.kind, kind), eq(masterOptions.isActive, true)))
        .orderBy(asc(masterOptions.sortOrder), asc(masterOptions.name));
    },
    ["list-master-options", kind],
    { tags: [CACHE_TAGS.masters], revalidate: 600 },
  )();
}

export interface MasterOptionWithCode {
  id: string;
  name: string;
  code: string | null;
}

/**
 * Active options WITH their short code for the item-form — the live code
 * preview needs the code to assemble a `buildItemCode` result client-side.
 * Same cache + tag as `listMasterOptions`.
 */
export async function listMasterOptionsWithCode(
  kind: MasterKind,
): Promise<MasterOptionWithCode[]> {
  return unstable_cache(
    async (): Promise<MasterOptionWithCode[]> => {
      return db
        .select({
          id: masterOptions.id,
          name: masterOptions.name,
          code: masterOptions.code,
        })
        .from(masterOptions)
        .where(and(eq(masterOptions.kind, kind), eq(masterOptions.isActive, true)))
        .orderBy(asc(masterOptions.sortOrder), asc(masterOptions.name));
    },
    ["list-master-options-with-code", kind],
    { tags: [CACHE_TAGS.masters], revalidate: 600 },
  )();
}

/** Full rows for the admin Masters screen (all kinds, active + inactive). */
export async function listAllMasters(): Promise<MasterOption[]> {
  return db
    .select()
    .from(masterOptions)
    .orderBy(
      asc(masterOptions.kind),
      asc(masterOptions.sortOrder),
      asc(masterOptions.name),
    );
}
