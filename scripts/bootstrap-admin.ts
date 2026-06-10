/**
 * One-time CLI to create the first admin employee on a brand-new deployment.
 *
 * Usage:
 *   cp .env.local .env.bootstrap
 *   pnpm bootstrap-admin --email altus@carbideindia.com --name "Admin Name"
 *
 * (pnpm 10 dropped the `--` separator — it's now passed as a literal arg.)
 *
 * Inserts ONLY the employees row (isAdmin = true). No auth-provider calls:
 * the admin signs in through Clerk and getCurrentEmployee() links the
 * Clerk user to this row by email on first sign-in.
 *
 * Deletes the .env.bootstrap file afterwards.
 */

import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { employees } from "../db/schema";
import { normalizeName } from "../lib/validators/employee";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name:  { type: "string" },
    },
  });
  const email = values.email;
  const name  = values.name;

  if (!email || !name) {
    console.error("Usage: pnpm bootstrap-admin --email <email> --name \"<name>\"");
    process.exit(1);
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Check if already exists
  const existingByEmail = await db.query.employees.findFirst({
    where: eq(employees.email, normalizedEmail),
  });
  if (existingByEmail) {
    console.error(`Employee with email ${email} already exists (id=${existingByEmail.id}). Aborting.`);
    process.exit(1);
  }

  const [emp] = await db.insert(employees).values({
    name:      normalizeName(name),
    email:     normalizedEmail,
    role:      "both",
    isAdmin:   true,
    isActive:  true,
    invitedAt: new Date(),
  }).returning();
  if (!emp) {
    throw new Error("Employee insert returned no row — DB write may have failed silently.");
  }

  console.log("\n✓ First admin bootstrapped:");
  console.log(`  id:    ${emp.id}`);
  console.log(`  email: ${emp.email}`);
  console.log("\nNext: sign in at /login with this email (create the Clerk user");
  console.log("or accept a Clerk invitation) — the row links automatically on");
  console.log("first sign-in.");
  console.log("\nDELETE .env.bootstrap NOW.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
