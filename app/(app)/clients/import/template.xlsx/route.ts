import { requireAdmin } from "@/lib/auth/current";
import { loadLookups, specRefKinds } from "@/lib/import/lookups";
import { buildTemplateWorkbook } from "@/lib/import/engine/template";
import { kycImportSpec } from "@/lib/import/specs/kyc";

/**
 * GET /clients/import/template.xlsx
 *
 * Admin-only download of the Client Master import template: header row + one
 * example row, plus a "Valid values" sheet listing the current Customer Type /
 * Industry Type / Product Type option names and a note that those multi-select
 * columns accept comma/semicolon-separated values.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await requireAdmin();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const lookups = await loadLookups(specRefKinds(kycImportSpec.fields));
  const buf = buildTemplateWorkbook(kycImportSpec, lookups);

  return new Response(buf, {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="client-import-template.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
