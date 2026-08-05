/**
 * Role-name rules shared by the Roles & Permissions admin (server actions,
 * queries AND the client components) — deliberately dependency-free so it can
 * be imported from both sides of the RSC boundary and unit-tested directly.
 *
 * `roles.name` is a CODE IDENTIFIER, not a display string: `lib/auth/roles.ts`
 * short-circuits on the literal "admin", and `requireRole("production")`,
 * `requireRole("accounts")`, `requireRole("dispatch")` plus the stage machine's
 * `actorRoleFor()` all quote the seeded names. Renaming one of those silently
 * revokes access for everyone holding it, so the canonical seven are locked:
 * their `label` and `sort_order` stay editable, their `name` does not.
 */

/** The role name that implies every other role (lib/auth/roles.ts). */
export const ADMIN_ROLE_NAME = "admin";

/**
 * The seven pipeline actors seeded by scripts/seed-defaults.ts. Referenced by
 * name from server code — locked against rename and against deletion.
 */
export const CANONICAL_ROLE_NAMES = [
  "sales",
  "costing",
  "production",
  "qc",
  "dispatch",
  "accounts",
  ADMIN_ROLE_NAME,
] as const;

export type CanonicalRoleName = (typeof CANONICAL_ROLE_NAMES)[number];

/** True when the name is one of the code-referenced seeded roles. */
export function isCanonicalRoleName(name: string): boolean {
  return (CANONICAL_ROLE_NAMES as readonly string[]).includes(
    name.trim().toLowerCase(),
  );
}

/**
 * Allowed shape for a new role name: lowercase snake_case, starts with a
 * letter. Matches how the seeded names read so `requireRole("...")` call sites
 * stay copy-pasteable.
 */
export const ROLE_NAME_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;

/** Lowercases + collapses whitespace/dashes to underscores, e.g. "Store Keeper" → "store_keeper". */
export function normalizeRoleName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Human explanation for a rejected name — used verbatim by the UI + actions. */
export const ROLE_NAME_HINT =
  "Use lowercase letters, digits and underscores (2-32 chars), starting with a letter.";
