import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Employee } from "@/db/schema";

// lib/auth/permissions imports "server-only" (and transitively via current.ts);
// neutralise so the module loads outside a real server component.
vi.mock("server-only", () => ({}));

// requireUser is the base guard requirePermission layers on.
const requireUser = vi.fn();
vi.mock("@/lib/auth/current", () => ({ requireUser }));

// Two shapes are read:
//   db.selectDistinct({key}).from(employeeRoles).innerJoin().innerJoin().where()
//     → the keys granted through the employee's roles
//   db.select({key}).from(permissions).where()
//     → every active catalogue key (what is_admin resolves to)
let grantRows: { key: string }[] = [];
let catalogueRows: { key: string }[] = [];
vi.mock("@/lib/db", () => ({
  db: {
    selectDistinct: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve(grantRows),
          }),
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(catalogueRows),
      }),
    }),
  },
}));

function emp(partial: Partial<Employee>): Employee {
  return { id: "emp-1", isAdmin: false, ...partial } as Employee;
}

beforeEach(() => {
  requireUser.mockReset();
  grantRows = [];
  catalogueRows = [];
});

describe("getEffectivePermissions", () => {
  it("resolves the keys granted through the employee's roles", async () => {
    grantRows = [{ key: "clients.view" }, { key: "clients.manage" }];
    const { getEffectivePermissions } = await import("@/lib/auth/permissions");
    const res = await getEffectivePermissions(emp({}));
    expect([...res.keys].sort()).toEqual(["clients.manage", "clients.view"]);
    expect(res.isSuperAdmin).toBe(false);
  });

  it("gives an is_admin employee the whole active catalogue", async () => {
    grantRows = [];
    catalogueRows = [{ key: "clients.view" }, { key: "roles.manage" }];
    const { getEffectivePermissions } = await import("@/lib/auth/permissions");
    const res = await getEffectivePermissions(emp({ isAdmin: true }));
    expect(res.isSuperAdmin).toBe(true);
    expect(res.keys.has("roles.manage")).toBe(true);
  });

  it("is empty for a non-admin with no grants (fresh database)", async () => {
    const { getEffectivePermissions } = await import("@/lib/auth/permissions");
    const res = await getEffectivePermissions(emp({}));
    expect(res.keys.size).toBe(0);
  });
});

describe("hasPermission", () => {
  it("is true when ANY named key is held", async () => {
    grantRows = [{ key: "costing.view" }];
    const { hasPermission } = await import("@/lib/auth/permissions");
    expect(await hasPermission(emp({}), "costing.manage", "costing.view")).toBe(true);
  });

  it("is false when none are held", async () => {
    grantRows = [{ key: "costing.view" }];
    const { hasPermission } = await import("@/lib/auth/permissions");
    expect(await hasPermission(emp({}), "costing.approve")).toBe(false);
  });

  it("short-circuits to true for is_admin without reading grants", async () => {
    grantRows = [];
    const { hasPermission } = await import("@/lib/auth/permissions");
    expect(await hasPermission(emp({ isAdmin: true }), "danger_zone.manage")).toBe(true);
  });

  it("requires nothing when called with no keys", async () => {
    const { hasPermission } = await import("@/lib/auth/permissions");
    expect(await hasPermission(emp({}))).toBe(true);
  });
});

describe("hasEveryPermission", () => {
  it("needs all named keys", async () => {
    grantRows = [{ key: "qc.view" }];
    const { hasEveryPermission } = await import("@/lib/auth/permissions");
    expect(await hasEveryPermission(emp({}), "qc.view", "qc.manage")).toBe(false);
    expect(await hasEveryPermission(emp({}), "qc.view")).toBe(true);
  });
});

describe("requirePermission", () => {
  it("returns the employee when the permission is held", async () => {
    const e = emp({ id: "emp-9" });
    requireUser.mockResolvedValue(e);
    grantRows = [{ key: "dispatch.manage" }];
    const { requirePermission } = await import("@/lib/auth/permissions");
    await expect(requirePermission("dispatch.manage")).resolves.toBe(e);
  });

  it("throws Forbidden when it is not", async () => {
    requireUser.mockResolvedValue(emp({}));
    grantRows = [];
    const { requirePermission } = await import("@/lib/auth/permissions");
    await expect(requirePermission("invoices.manage")).rejects.toThrow("Forbidden");
  });

  it("lets an is_admin employee through", async () => {
    const e = emp({ isAdmin: true });
    requireUser.mockResolvedValue(e);
    const { requirePermission } = await import("@/lib/auth/permissions");
    await expect(requirePermission("invoices.manage")).resolves.toBe(e);
  });
});
