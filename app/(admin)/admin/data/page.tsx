import { ArrowDownToLine, ArrowUpFromLine, ListChecks, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current";
import { MAX_EXPORT_ROWS } from "@/lib/exports/csv";
import { loadLookups, specRefKinds } from "@/lib/import/lookups";
import type { RefKind } from "@/lib/import/engine/spec";
import {
  DATA_JOB_STATUSES,
  DATA_JOB_DIRECTIONS,
  type DataJobDirection,
  type DataJobStatus,
} from "@/db/enums";
import {
  EXPORT_CATALOG,
  IMPORT_CATALOG,
  type ImportEntityKey,
} from "@/lib/data-transfer/catalog";
import { getExportRowCounts } from "@/lib/data-transfer/exporters";
import {
  getDataTransferStats,
  listDataTransferJobs,
  listLoggedEntities,
  listPersonalDataExports,
} from "@/lib/queries/data";
import { AdminKpiTile } from "@/components/admin/admin-kpi-tile";
import { DataTabs } from "@/components/admin/data-tabs";
import {
  DataImportCatalog,
  type ImportCatalogItem,
} from "@/components/admin/data-import-catalog";
import { DataExportCatalog } from "@/components/admin/data-export-catalog";
import { DataJobHistory } from "@/components/admin/data-job-history";
import { DataPersonalExports } from "@/components/admin/data-personal-exports";
import {
  importClients,
  importEnquiries,
  importItems,
  importMeetings,
  importNegotiations,
  importQuotations,
  importSalesOrders,
  importSamples,
} from "@/app/(admin)/admin/data/actions";

export const dynamic = "force-dynamic";

const JOB_LIMIT = 100;

/**
 * Each catalogue entry's commit action. These wrap the module's OWN bulk-import
 * commit (so numbering, dedupe and audit stay identical) and add the
 * `data_transfer_jobs` log entry. Server actions must be referenced statically
 * to cross the RSC boundary, hence the explicit map.
 */
const COMMIT_BY_KEY: Record<
  ImportEntityKey,
  ImportCatalogItem["commit"]
> = {
  clients: importClients,
  items: importItems,
  enquiries: importEnquiries,
  samples: importSamples,
  meetings: importMeetings,
  quotations: importQuotations,
  negotiations: importNegotiations,
  salesOrders: importSalesOrders,
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AdminDataPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await searchParams;

  // Transfer-log filters are URL state; anything unrecognised falls back to
  // "no filter" rather than erroring on a hand-typed query string.
  const dirParam = firstParam(sp.dir);
  const stateParam = firstParam(sp.state);
  const entityParam = firstParam(sp.entity);
  const direction = (DATA_JOB_DIRECTIONS as readonly string[]).includes(
    dirParam ?? "",
  )
    ? (dirParam as DataJobDirection)
    : undefined;
  const status = (DATA_JOB_STATUSES as readonly string[]).includes(
    stateParam ?? "",
  )
    ? (stateParam as DataJobStatus)
    : undefined;
  const entity =
    entityParam && entityParam !== "all" ? entityParam : undefined;

  // One lookup load for the whole catalogue: the union of every ref kind any
  // spec uses. buildTemplateWorkbook only reads the kinds its own spec names,
  // so sharing one Lookups object is safe and saves ~30 queries.
  const allRefKinds = [
    ...new Set(
      IMPORT_CATALOG.flatMap((e) => specRefKinds(e.spec.fields)),
    ),
  ] as RefKind[];

  const [lookups, exportCounts, jobs, stats, loggedEntities, personalExports] =
    await Promise.all([
      loadLookups(allRefKinds),
      getExportRowCounts(),
      listDataTransferJobs({ direction, status, entity }, JOB_LIMIT),
      getDataTransferStats(),
      listLoggedEntities(),
      listPersonalDataExports(),
    ]);

  const importItemsForUi: ImportCatalogItem[] = IMPORT_CATALOG.map((e) => ({
    ...e,
    commit: COMMIT_BY_KEY[e.key],
  }));

  // Entity key → friendly name for the log table + its filter. Template
  // downloads are logged under "<key>_template", so map those too.
  const entityLabels: Record<string, string> = {};
  for (const e of EXPORT_CATALOG) entityLabels[e.key] = e.label;
  for (const e of IMPORT_CATALOG) {
    entityLabels[e.key] = e.plural;
    entityLabels[`${e.key}_template`] = `${e.plural} template`;
  }

  const totalExportableRows = Object.values(exportCounts).reduce(
    (sum, n) => sum + n,
    0,
  );

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-8">
        <span
          className="block text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#a2a8b4]"
          style={{ fontFamily: "var(--font-mono-display)" }}
        >
          Admin · System
        </span>
        <h1 className="mt-1.5 text-[30px] font-extrabold leading-tight tracking-tight text-[#1e2f66]">
          Import / Export
        </h1>
        <p className="mt-2 max-w-3xl text-[14px] text-[#6b7280] tabular-nums">
          {IMPORT_CATALOG.length} importable entities · {EXPORT_CATALOG.length}{" "}
          exportable datasets · {totalExportableRows.toLocaleString("en-IN")}{" "}
          rows on file · {stats.total} logged runs
        </p>
        <p className="mt-2 max-w-3xl text-[14px] text-[#6b7280]">
          One door for bulk data. Imports run through each module&rsquo;s own
          create path, so numbering, deduplication and the audit trail behave
          exactly as they do for single-record entry. Every run is recorded in
          the transfer log.
        </p>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-4 max-md:grid-cols-1 lg:grid-cols-4">
        <AdminKpiTile
          label="Rows imported"
          value={stats.rowsImported}
          hint={`${stats.imports} import run${stats.imports === 1 ? "" : "s"}`}
          tone="green"
          icon={<ArrowDownToLine size={16} strokeWidth={2.2} />}
          index={0}
        />
        <AdminKpiTile
          label="Rows exported"
          value={stats.rowsExported}
          hint={`${stats.exports} export run${stats.exports === 1 ? "" : "s"}`}
          tone="blue"
          icon={<ArrowUpFromLine size={16} strokeWidth={2.2} />}
          index={1}
        />
        <AdminKpiTile
          label="In flight"
          value={stats.inFlight}
          hint={
            stats.inFlight === 0
              ? "Nothing stuck"
              : "Retire from the transfer log"
          }
          tone="amber"
          icon={<ListChecks size={16} strokeWidth={2.2} />}
          index={2}
        />
        <AdminKpiTile
          label="Failed runs"
          value={stats.failed}
          hint={stats.failed === 0 ? "Clean history" : "Check the reasons"}
          tone="red"
          icon={<TriangleAlert size={16} strokeWidth={2.2} />}
          index={3}
        />
      </div>

      <DataTabs
        counts={{
          import: IMPORT_CATALOG.length,
          export: EXPORT_CATALOG.length,
          history: jobs.length,
        }}
        import={
          <DataImportCatalog items={importItemsForUi} lookups={lookups} />
        }
        export={
          <div className="flex flex-col gap-8">
            <DataExportCatalog
              entries={EXPORT_CATALOG}
              counts={exportCounts}
              csvRowCap={MAX_EXPORT_ROWS}
            />
            <DataPersonalExports rows={personalExports} />
          </div>
        }
        history={
          <DataJobHistory
            jobs={jobs}
            entities={loggedEntities}
            entityLabels={entityLabels}
            limit={JOB_LIMIT}
          />
        }
      />
    </div>
  );
}
