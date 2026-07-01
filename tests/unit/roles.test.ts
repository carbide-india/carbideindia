import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Employee } from "@/db/schema";

// lib/auth/roles imports "server-only" (transitively via current.ts too);
// neutralise so the module loads outside a real server component.
vi.mock("server-only", () => ({}));

// requireUser is the base guard requireRole layers on. We control what it
// returns per-test.
const requireUser = vi.fn();
vi.mock("@/lib/auth/current", () => ({ requireUser }));

// userRoles reads employee_roles via:
//   db.select({...}).from(employeeRoles).innerJoin(...).where(...)
// The final builder is awaited → it must resolve to the grant rows. `grantRows`
// lets each test set what the DB returns.
let grantRows: { name: string }[] = [];
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve(grantRows),
        }),
      }),
    }),
  },
}));

// Only .id / .isAdmin are read by the roles layer.
function emp(partial: Partial<Employee>): Employee {
  return { id: "emp-1", isAdmin: false, ...partial } as Employee;
}

beforeEach(() => {
  requireUser.mockReset();
  grantRows = [];
});

describe("userRoles", () => {
  it("returns explicit grants when present", async () => {
    grantRows = [{ name: "sales" }, { name: "costing" }];
    const { userRoles } = await import("@/lib/auth/roles");
    const res = await userRoles(emp({ isAdmin: false }));
    expect(res).toEqual(["sales", "costing"]);
  });

  it("falls back to ['admin'] when no grants and isAdmin", async () => {
    grantRows = [];
    const { userRoles } = await import("@/lib/auth/roles");
    const res = await userRoles(emp({ isAdmin: true }));
    expect(res).toEqual(["admin"]);
  });

  it("falls back to [] when no grants and not admin", async () => {
    grantRows = [];
    const { userRoles } = await import("@/lib/auth/roles");
    const res = await userRoles(emp({ isAdmin: false }));
    expect(res).toEqual([]);
  });
});

describe("hasRole", () => {
  it("admin implies all roles (explicit admin grant)", async () => {
    grantRows = [{ name: "admin" }];
    const { hasRole } = await import("@/lib/auth/roles");
    expect(await hasRole(emp({ isAdmin: false }), "dispatch")).toBe(true);
    expect(await hasRole(emp({ isAdmin: false }), "sales", "accounts")).toBe(true);
  });

  it("admin implies all via isAdmin fallback (no grants)", async () => {
    grantRows = [];
    const { hasRole } = await import("@/lib/auth/roles");
    expect(await hasRole(emp({ isAdmin: true }), "qc")).toBe(true);
  });

  it("grants a matching explicit role", async () => {
    grantRows = [{ name: "sales" }];
    const { hasRole } = await import("@/lib/auth/roles");
    expect(await hasRole(emp({ isAdmin: false }), "sales")).toBe(true);
  });

  it("denies when the required role is not held", async () => {
    grantRows = [{ name: "sales" }];
    const { hasRole } = await import("@/lib/auth/roles");
    expect(await hasRole(emp({ isAdmin: false }), "dispatch")).toBe(false);
  });

  it("denies for a non-admin with no grants", async () => {
    grantRows = [];
    const { hasRole } = await import("@/lib/auth/roles");
    expect(await hasRole(emp({ isAdmin: false }), "sales")).toBe(false);
  });

  it("returns true when no roles are required", async () => {
    grantRows = [];
    const { hasRole } = await import("@/lib/auth/roles");
    expect(await hasRole(emp({ isAdmin: false }))).toBe(true);
  });
});

describe("requireRole", () => {
  it("returns the employee when they hold the role", async () => {
    grantRows = [{ name: "costing" }];
    const e = emp({ id: "emp-costing", isAdmin: false });
    requireUser.mockResolvedValue(e);
    const { requireRole } = await import("@/lib/auth/roles");
    await expect(requireRole("costing")).resolves.toBe(e);
  });

  it("passes an admin for any role (isAdmin fallback)", async () => {
    grantRows = [];
    const e = emp({ id: "emp-admin", isAdmin: true });
    requireUser.mockResolvedValue(e);
    const { requireRole } = await import("@/lib/auth/roles");
    await expect(requireRole("dispatch")).resolves.toBe(e);
  });

  it("throws Forbidden when the user lacks all named roles", async () => {
    grantRows = [{ name: "sales" }];
    requireUser.mockResolvedValue(emp({ isAdmin: false }));
    const { requireRole } = await import("@/lib/auth/roles");
    await expect(requireRole("accounts")).rejects.toThrow("Forbidden");
  });

  it("propagates a requireUser rejection (unauthenticated)", async () => {
    requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));
    const { requireRole } = await import("@/lib/auth/roles");
    await expect(requireRole("sales")).rejects.toThrow("NEXT_REDIRECT");
  });
});
