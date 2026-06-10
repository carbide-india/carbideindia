#!/usr/bin/env tsx
/**
 * One-time importer for the legacy Carbide India Google Sheet.
 * Spec: docs/superpowers/specs/2026-05-14-vpinnacle-m4-import-and-multichannel-design.md
 *
 * Usage:
 *   pnpm import:legacy -- --phase=all --employees-csv=_reference/employees.csv \
 *                        --tasks-csv=_reference/tasks.csv --commit
 *
 * Without --commit, the script runs in dry-run mode (default).
 * The import only creates employees rows — auth identities live in Clerk
 * and link automatically (by email) on each employee's first sign-in.
 * The admin invites people later via /admin/employees.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { parseArgs } from "node:util";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  departments,
  employees,
  tasks,
  taskEvents,
} from "@/db/schema";
import { parseLegacyEmployees, parseLegacyTasks, type LegacyTaskRow } from "@/lib/import/csv-schemas";
import { mapLegacyStatus } from "@/lib/import/status-mapping";
import { computeLegacyImportKey } from "@/lib/import/legacy-key";
import { deriveShortId } from "@/lib/import/short-id";
import { parseLegacyDate } from "@/lib/import/parse-date";

interface Args {
  phase: "employees" | "tasks" | "all";
  employeesCsv: string;
  tasksCsv: string;
  commit: boolean;
}

function parseFlags(): Args {
  const { values } = parseArgs({
    options: {
      phase:           { type: "string", default: "all" },
      "employees-csv": { type: "string", default: "_reference/employees.csv" },
      "tasks-csv":     { type: "string", default: "_reference/tasks.csv" },
      commit:          { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  const phase = (values.phase as Args["phase"]) ?? "all";
  if (!["employees", "tasks", "all"].includes(phase)) {
    throw new Error(`--phase must be employees|tasks|all (got "${phase}")`);
  }
  return {
    phase,
    employeesCsv: values["employees-csv"] as string,
    tasksCsv:     values["tasks-csv"] as string,
    commit:       Boolean(values.commit),
  };
}

interface Report {
  timestamp: string;
  args: Args;
  employees: {
    created: number;
    skipped_already_exists: number;
    failed: { line: number; email: string; reason: string }[];
  };
  tasks: {
    created: number;
    skipped_already_imported: number;
    synthesised_subjects: number;
    failed: { line: number; reason: string; row: LegacyTaskRow }[];
  };
}

/**
 * Look up a department row by name (case-insensitive, trimmed).  Mirrors
 * the logic in app/(admin)/admin/employees/actions.ts so the importer
 * keeps employees.department_id in lock-step with the legacy text
 * column (M3 soft-migration invariant).
 */
async function resolveDepartmentByName(
  raw: string | null | undefined,
): Promise<{ id: string; name: string } | null> {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const [row] = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(sql`lower(${departments.name}) = lower(${trimmed})`)
    .limit(1);
  return row ?? null;
}

async function runEmployeesPhase(csv: string, args: Args, report: Report) {
  const { rows, errors } = parseLegacyEmployees(csv);
  for (const e of errors) {
    report.employees.failed.push({ line: e.line, email: String(e.raw.email ?? ""), reason: e.message });
  }
  for (const [i, row] of rows.entries()) {
    const line = i + 2;
    const existing = await db.query.employees.findFirst({ where: eq(employees.email, row.email) });
    if (existing) {
      report.employees.skipped_already_exists++;
      continue;
    }
    if (!args.commit) {
      report.employees.created++;
      continue;
    }
    // Ensure department row exists.
    if (row.department) {
      const dept = await db.query.departments.findFirst({
        where: sql`lower(${departments.name}) = lower(${row.department})`,
      });
      if (!dept) {
        await db.insert(departments).values({ name: row.department }).onConflictDoNothing();
      }
    }

    // Resolve the matching department FK so employees.department_id stays
    // in lock-step with the legacy employees.department text column.
    const matchedDept = await resolveDepartmentByName(row.department);
    const departmentText = matchedDept
      ? matchedDept.name
      : row.department && row.department.trim() !== ""
        ? row.department.trim()
        : null;

    // Insert the employees row. clerk_user_id stays NULL — the row links
    // to the Clerk user (by email) on the employee's first sign-in.
    let inserted: typeof employees.$inferSelect | undefined;
    try {
      [inserted] = await db.insert(employees).values({
        name:         row.name,
        email:        row.email,
        role:         row.role,
        department:   departmentText,
        departmentId: matchedDept?.id ?? null,
        isAdmin:      row.isAdmin,
        invitedAt:    new Date(),
      }).returning();
    } catch (err: any) {
      report.employees.failed.push({ line, email: row.email, reason: `DB: ${err?.message ?? err}` });
      continue;
    }
    if (!inserted) {
      report.employees.failed.push({ line, email: row.email, reason: "DB: insert returned no row" });
      continue;
    }

    report.employees.created++;
  }
}

async function runTasksPhase(csv: string, args: Args, report: Report) {
  const { rows, errors } = parseLegacyTasks(csv);
  for (const e of errors) {
    report.tasks.failed.push({ line: e.line, reason: e.message, row: e.raw as unknown as LegacyTaskRow });
  }
  const empByName = new Map<string, { id: string; email: string }>();
  for (const e of await db.select({ id: employees.id, name: employees.name, email: employees.email }).from(employees)) {
    empByName.set(e.name.trim().toLowerCase(), { id: e.id, email: e.email });
  }
  for (const [i, row] of rows.entries()) {
    const line = i + 2;
    const doer       = empByName.get(row.doer.trim().toLowerCase());
    const initiator  = empByName.get(row.initiator.trim().toLowerCase());
    if (!doer)       { report.tasks.failed.push({ line, reason: `unknown doer "${row.doer}"`, row });           continue; }
    if (!initiator)  { report.tasks.failed.push({ line, reason: `unknown initiator "${row.initiator}"`, row }); continue; }
    const status = mapLegacyStatus(row.status);
    if (!status)     { report.tasks.failed.push({ line, reason: `unknown status "${row.status}"`, row });        continue; }
    const assignDate = parseLegacyDate(row.assignDate);
    const dueDate    = parseLegacyDate(row.dueDate);
    if (isNaN(assignDate.getTime())) { report.tasks.failed.push({ line, reason: `bad assignDate "${row.assignDate}"`, row }); continue; }
    if (isNaN(dueDate.getTime()))    { report.tasks.failed.push({ line, reason: `bad dueDate "${row.dueDate}"`, row });       continue; }

    let subject = row.subject;
    let subjectSynthesised = false;
    if (!subject) {
      if (row.description) {
        subject = row.description.slice(0, 60);
      } else {
        // Salt the synthesised subject with the source line so multiple
        // empty-subject rows don't collapse to the same legacy_import_key.
        subject = `(imported row ${line})`;
        subjectSynthesised = true;
      }
    }
    const key = computeLegacyImportKey({
      doerEmail: doer.email,
      initiatorEmail: initiator.email,
      assignDate: row.assignDate,
      dueDate: row.dueDate,
      status,
      subject,
    });
    const dup = await db.query.tasks.findFirst({ where: eq(tasks.legacyImportKey, key) });
    if (dup) { report.tasks.skipped_already_imported++; continue; }
    if (!args.commit) {
      report.tasks.created++;
      if (subjectSynthesised) report.tasks.synthesised_subjects++;
      continue;
    }
    const taskId = crypto.randomUUID();
    try {
      await db.transaction(async (tx) => {
        await tx.insert(tasks).values({
          id: taskId,
          title: subject,
          subject,
          description: row.description,
          doerId: doer.id,
          initiatorId: initiator.id,
          createdById: initiator.id,
          priority: row.priority ?? "not_imp_not_urgent",
          status,
          createdAt: assignDate,
          dueAt: dueDate,
          shortId: deriveShortId(taskId),
          legacyImportKey: key,
        });
        await tx.insert(taskEvents).values({
          taskId,
          actorId: initiator.id,
          eventType: "created",
          note: `imported from legacy sheet on ${new Date().toISOString().slice(0,10)}`,
          createdAt: assignDate,
        });
      });
      report.tasks.created++;
      if (subjectSynthesised) report.tasks.synthesised_subjects++;
    } catch (err) {
      report.tasks.failed.push({ line, reason: `DB: ${(err as Error).message}`, row });
    }
  }
}

async function main() {
  const args = parseFlags();
  const report: Report = {
    timestamp: new Date().toISOString(),
    args,
    employees: { created: 0, skipped_already_exists: 0, failed: [] },
    tasks:     { created: 0, skipped_already_imported: 0, synthesised_subjects: 0, failed: [] },
  };
  const banner = args.commit ? "COMMIT MODE (writing to DB)" : "DRY RUN (no writes)";
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`Legacy import — ${report.timestamp}  [${banner}]`);
  console.log(`══════════════════════════════════════════════════════════════\n`);
  if (args.phase === "employees" || args.phase === "all") {
    console.log(`Phase 1: ${args.employeesCsv}`);
    const csv = readFileSync(resolve(args.employeesCsv), "utf8");
    await runEmployeesPhase(csv, args, report);
    console.log(`  ✓ Created: ${report.employees.created}`);
    console.log(`  ⊘ Skipped (already exists): ${report.employees.skipped_already_exists}`);
    console.log(`  ✗ Failed: ${report.employees.failed.length}`);
  }
  if (args.phase === "tasks" || args.phase === "all") {
    console.log(`\nPhase 2: ${args.tasksCsv}`);
    const csv = readFileSync(resolve(args.tasksCsv), "utf8");
    await runTasksPhase(csv, args, report);
    console.log(`  ✓ Created: ${report.tasks.created}`);
    console.log(`  ⊘ Skipped (already imported): ${report.tasks.skipped_already_imported}`);
    console.log(`  ⚠ Synthesised subjects: ${report.tasks.synthesised_subjects}`);
    console.log(`  ✗ Failed: ${report.tasks.failed.length}`);
    for (const f of report.tasks.failed.slice(0, 5)) console.log(`    - Row ${f.line}: ${f.reason}`);
    if (report.tasks.failed.length > 5) console.log(`    ... ${report.tasks.failed.length - 5} more`);
  }
  const out = `_reference/import-report-${report.timestamp.replace(/[:.]/g, "-")}.json`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nFull report: ${out}\n`);
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
