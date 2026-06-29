import { requireUser } from "@/lib/auth/current";
import { loadLookups, specRefKinds } from "@/lib/import/lookups";
import { buildTemplateWorkbook } from "@/lib/import/engine/template";
import { itemImportSpec } from "@/lib/import/specs/item";

/**
 * GET /items/import/template.xlsx
 *
 * Role-open (requireUser) download of the Item Master import template: header
 * row + one example row, plus a "Valid values" sheet listing the current
 * Shape/Grade/Tolerance/Condition option names.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await requireUser();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const lookups = await loadLookups(specRefKinds(itemImportSpec.fields));
  const buf = buildTemplateWorkbook(itemImportSpec, lookups);

  return new Response(buf, {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="item-import-template.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
