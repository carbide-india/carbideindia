import { describe, it, expect, vi, beforeEach } from "vitest";

// Must be a real UUID — the action validates the id with EmployeeIdSchema
// (z.string().uuid()) before doing any work.
const EMP_ID = "11111111-1111-1111-1111-111111111111";

// Hoisted mock handles so we can (re)assert their implementations in
// beforeEach. The global tests/setup.ts runs vi.clearAllMocks() after every
// test, and the full suite shares worker module state — re-establishing the
// implementations per-test keeps this deterministic in isolation AND in suite.
const h = vi.hoisted(() => ({
  updateUser: vi.fn(),
  revokeRefreshTokens: vi.fn(),
  sendEmail: vi.fn(),
  requireAdmin: vi.fn(),
  findFirst: vi.fn(),
  dbCalls: [] as string[],
}));

vi.mock("@/lib/firebase/admin", () => ({
  getFirebaseAdminAuth: () => ({
    updateUser: h.updateUser,
    revokeRefreshTokens: h.revokeRefreshTokens,
  }),
}));

vi.mock("@/lib/email/resend", () => ({
  sendPasswordChangedByAdminEmail: h.sendEmail,
}));

vi.mock("@/lib/auth/current", () => ({ requireAdmin: h.requireAdmin }));

vi.mock("@/lib/db", () => ({
  db: {
    query: { employees: { findFirst: h.findFirst } },
    delete: () => ({ where: () => { h.dbCalls.push("delete:auth_sessions"); return Promise.resolve(); } }),
    update: () => ({ set: (v: unknown) => ({ where: () => { h.dbCalls.push("update:employees:" + JSON.stringify(Object.keys(v as object))); return Promise.resolve(); } }) }),
    insert: () => ({ values: (v: { eventType?: string }) => { h.dbCalls.push("insert:event:" + v.eventType); return Promise.resolve(); } }),
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/cache-tags", () => ({ CACHE_TAGS: { employees: "employees" } }));

beforeEach(() => {
  vi.resetModules();
  h.dbCalls.length = 0;
  h.updateUser.mockReset().mockResolvedValue(undefined);
  h.revokeRefreshTokens.mockReset().mockResolvedValue(undefined);
  h.sendEmail.mockReset().mockResolvedValue({ id: "e1", error: null });
  h.requireAdmin.mockReset().mockResolvedValue({ id: "admin-1", name: "Admin" });
  h.findFirst.mockReset().mockResolvedValue({
    id: EMP_ID,
    name: "Dev User",
    email: "dev@altus.test",
    firebaseUid: "fb-uid-1",
    isActive: true,
  });
});

describe("resetEmployeePassword", () => {
  it("sets the Firebase password, revokes tokens, clears sessions, stamps the column, audits, and emails", async () => {
    const { resetEmployeePassword } = await import(
      "@/app/(admin)/admin/employees/actions"
    );
    const res = await resetEmployeePassword(EMP_ID, "NewPass123!");
    expect(res.ok).toBe(true);
    expect(h.updateUser).toHaveBeenCalledWith("fb-uid-1", { password: "NewPass123!" });
    expect(h.revokeRefreshTokens).toHaveBeenCalledWith("fb-uid-1");
    expect(h.dbCalls).toContain("delete:auth_sessions");
    expect(h.dbCalls.some((c) => c.startsWith("update:employees:"))).toBe(true);
    expect(h.dbCalls).toContain("insert:event:password_reset_by_admin");
    expect(h.sendEmail).toHaveBeenCalled();
  });

  it("rejects a too-short password before touching Firebase", async () => {
    const { resetEmployeePassword } = await import(
      "@/app/(admin)/admin/employees/actions"
    );
    const res = await resetEmployeePassword(EMP_ID, "short");
    expect(res.ok).toBe(false);
    expect(h.updateUser).not.toHaveBeenCalled();
  });
});
