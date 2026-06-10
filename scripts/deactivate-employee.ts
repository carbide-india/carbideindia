/**
 * One-off ops script: deactivate an employee (set is_active=false).
 * requireUser() blocks deactivated employees on every request; use the
 * admin UI's Deactivate action when you also want the Clerk user banned.
 * Reversible: see reactivateEmployee in
 * app/(admin)/admin/employees/actions.ts.
 *
 *   tsx --env-file=.env.local scripts/deactivate-employee.ts --id <uuid>            # dry-run
 *   tsx --env-file=.env.local scripts/deactivate-employee.ts --id <uuid> --commit   # apply
 */

import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { employees } from "../db/schema";

async function main() {
  const { values } = parseArgs({
    options: {
      id:     { type: "string" },
      commit: { type: "boolean", default: false },
    },
  });
  if (!values.id) {
    console.error("Usage: deactivate-employee --id <uuid> [--commit]");
    process.exit(1);
  }
  const id = values.id;

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, id) });
  if (!emp) {
    console.error(`No employee with id=${id}`);
    process.exit(1);
  }

  console.log(`\nTarget:`);
  console.log(`  id:        ${emp.id}`);
  console.log(`  name:      ${emp.name}`);
  console.log(`  email:     ${emp.email}`);
  console.log(`  isActive:  ${emp.isActive}  →  false`);

  if (!emp.isActive) {
    console.log("\nAlready inactive. Skipping.");
    return;
  }

  if (!values.commit) {
    console.log("\nDry-run. Re-run with --commit to apply.");
    return;
  }

  await db.update(employees).set({ isActive: false }).where(eq(employees.id, id));
  console.log("\n✓ employees.is_active = false");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
