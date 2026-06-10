import { describe, it, expect, vi, beforeEach } from "vitest";

const createInvitation = vi.fn().mockResolvedValue({ id: "inv_1" });
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn().mockResolvedValue({
    invitations: { createInvitation },
  }),
}));

vi.mock("@/lib/auth/current", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin-1", name: "Admin User" }),
}));

// inviteEmployee: dup-check via findFirst (return undefined = no dup), then
// insert(...).returning() yields the new row. Department helpers also call db;
// resolveDepartmentSelection issues a select on departments — return [] so it
// resolves to no departments. writeMemberships deletes + inserts; make the
// builders chainable for both .returning() and plain awaits.
const insertedValues: Record<string, unknown>[] = [];
vi.mock("@/lib/db", () => {
  const insertBuilder = {
    values: (v: Record<string, unknown>) => {
      insertedValues.push(v);
      return {
        returning: () =>
          Promise.resolve([
            {
              id: "00000000-0000-4000-8000-000000000000",
              name: "Dev User",
              email: "dev@carbide.test",
              role: "doer",
              department: null,
              isAdmin: false,
            },
          ]),
        onConflictDoNothing: () => Promise.resolve(),
        then: (resolve: (v: unknown) => unknown) => resolve(undefined),
      };
    },
  };
  return {
    db: {
      query: { employees: { findFirst: vi.fn().mockResolvedValue(undefined) } },
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
      insert: () => insertBuilder,
      delete: () => ({ where: () => Promise.resolve() }),
    },
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/cache-tags", () => ({ CACHE_TAGS: { employees: "employees" } }));

beforeEach(() => {
  createInvitation.mockClear().mockResolvedValue({ id: "inv_1" });
  insertedValues.length = 0;
});

describe("inviteEmployee (Clerk invitation flow)", () => {
  it("inserts the row WITHOUT a clerk_user_id and sends a Clerk invitation", async () => {
    const { inviteEmployee } = await import("@/app/(admin)/admin/employees/actions");
    const res = await inviteEmployee({
      name: "Dev User",
      email: "dev@carbide.test",
      role: "doer",
      departmentIds: [],
      primaryDepartmentId: null,
      isAdmin: false,
    });
    expect(res.ok).toBe(true);
    expect(res.warning).toBeUndefined();

    // The employees insert must NOT pre-assign an auth identity — linking
    // happens by email on first sign-in.
    const employeeInsert = insertedValues.find((v) => "email" in v);
    expect(employeeInsert).toMatchObject({ email: "dev@carbide.test" });
    expect(employeeInsert).not.toHaveProperty("clerkUserId");
    expect(employeeInsert).not.toHaveProperty("password");

    expect(createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAddress: "dev@carbide.test",
        notify: true,
        ignoreExisting: true,
        redirectUrl: expect.stringMatching(/^https?:\/\/.+\/login$/),
      }),
    );
  });

  it("keeps the row and returns a warning when the invitation email fails", async () => {
    createInvitation.mockRejectedValueOnce(new Error("Clerk is down"));
    const { inviteEmployee } = await import("@/app/(admin)/admin/employees/actions");
    const res = await inviteEmployee({
      name: "Dev User",
      email: "dev@carbide.test",
      role: "doer",
      departmentIds: [],
      primaryDepartmentId: null,
      isAdmin: false,
    });
    expect(res.ok).toBe(true);
    expect(res.warning).toMatch(/invitation email failed/i);
  });
});
