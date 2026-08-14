import { describe, it, expect, vi, beforeEach } from "vitest";

// Invitations run through Firebase, not Clerk: create (or reuse) the account,
// mint a password-reset link, pull its oobCode out and email OUR accept-invite
// URL instead of Firebase's own page.
const createUser = vi.fn().mockResolvedValue({ uid: "fb-1" });
const generatePasswordResetLink = vi
  .fn()
  .mockResolvedValue("https://firebase.test/action?oobCode=CODE123&mode=resetPassword");
vi.mock("@/lib/firebase/admin", () => ({
  adminAuth: {
    createUser: (...a: unknown[]) => createUser(...a),
    generatePasswordResetLink: (...a: unknown[]) => generatePasswordResetLink(...a),
  },
}));

const sendInviteEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email/resend", () => ({
  sendInviteEmail: (...a: unknown[]) => sendInviteEmail(...a),
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

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  // Something in the import chain wraps a query in unstable_cache. Passing the
  // function straight through means the test exercises the real query path
  // rather than a cache stub that could hide a bug.
  unstable_cache: <T>(fn: T) => fn,
}));
vi.mock("@/lib/cache-tags", () => ({ CACHE_TAGS: { employees: "employees" } }));

beforeEach(() => {
  createUser.mockClear().mockResolvedValue({ uid: "fb-1" });
  generatePasswordResetLink
    .mockClear()
    .mockResolvedValue("https://firebase.test/action?oobCode=CODE123&mode=resetPassword");
  sendInviteEmail.mockClear().mockResolvedValue(undefined);
  insertedValues.length = 0;
});

describe("inviteEmployee (Firebase invitation flow)", () => {
  it("inserts the row WITHOUT an auth identity and emails an onboarding link", async () => {
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
    expect(employeeInsert).not.toHaveProperty("firebaseUid");
    expect(employeeInsert).not.toHaveProperty("clerkUserId");
    expect(employeeInsert).not.toHaveProperty("password");

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "dev@carbide.test", emailVerified: false }),
    );
    // The invitee must land on OUR card, carrying the code Firebase minted —
    // not on Firebase's own reset page, which knows nothing about this app.
    const [to, name, url] = sendInviteEmail.mock.calls[0] as [string, string, string];
    expect(to).toBe("dev@carbide.test");
    expect(name).toBe("Dev User");
    expect(url).toMatch(/\/accept-invite\?oobCode=CODE123$/);
  });

  it("keeps the row and returns a warning when the invitation email fails", async () => {
    sendInviteEmail.mockRejectedValueOnce(new Error("Resend is down"));
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
