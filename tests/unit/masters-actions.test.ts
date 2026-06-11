import { describe, it, expect, vi, beforeEach } from "vitest";

const requireAdmin = vi.fn();
vi.mock("@/lib/auth/current", () => ({ requireAdmin }));

// createMasterOption: dup-check via select(...).from(...).where(...).limit(1)
// (return [] = no dup), then insert(...).values(...).returning() yields the new
// row. The audit write (settingsEvents) awaits a plain values(...) call, so the
// builder is also thenable. `insertError` lets the duplicate test make the
// masterOptions insert reject like postgres would (unique_violation 23505).
const insertedValues: Record<string, unknown>[] = [];
let insertError: unknown = null;
vi.mock("@/lib/db", () => {
  const insertBuilder = {
    values: (v: Record<string, unknown>) => {
      insertedValues.push(v);
      return {
        returning: () =>
          insertError
            ? Promise.reject(insertError)
            : Promise.resolve([
                {
                  id: "00000000-0000-4000-8000-000000000001",
                  kind: v.kind,
                  name: v.name,
                  isActive: true,
                  sortOrder: v.sortOrder ?? 100,
                },
              ]),
        then: (resolve: (v: unknown) => unknown) => resolve(undefined),
      };
    },
  };
  return {
    db: {
      query: {
        masterOptions: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
      select: () => ({
        from: () => ({
          where: () => ({ limit: () => Promise.resolve([]) }),
        }),
      }),
      insert: () => insertBuilder,
    },
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ id: "admin-1", name: "Admin User" });
  insertedValues.length = 0;
  insertError = null;
});

describe("createMasterOption", () => {
  it("inserts the option and returns its id", async () => {
    const { createMasterOption } = await import(
      "@/app/(admin)/admin/masters/actions"
    );
    const res = await createMasterOption({ kind: "tolerance", name: "H6" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.id).toBe("00000000-0000-4000-8000-000000000001");

    const optionInsert = insertedValues.find((v) => "kind" in v && "name" in v);
    expect(optionInsert).toMatchObject({ kind: "tolerance", name: "H6" });
  });

  it("maps a unique-violation insert (23505) to a friendly duplicate error", async () => {
    insertError = { code: "23505" };
    const { createMasterOption } = await import(
      "@/app/(admin)/admin/masters/actions"
    );
    const res = await createMasterOption({ kind: "condition", name: "Sintered" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/already exists/i);
  });

  it("rethrows when requireAdmin rejects (same contract as subjects actions)", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("FORBIDDEN"));
    const { createMasterOption } = await import(
      "@/app/(admin)/admin/masters/actions"
    );
    await expect(
      createMasterOption({ kind: "tolerance", name: "H7" }),
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("updateMasterOption", () => {
  it("rejects an invalid id without touching the db", async () => {
    const { updateMasterOption } = await import(
      "@/app/(admin)/admin/masters/actions"
    );
    const res = await updateMasterOption("not-a-uuid", { isActive: false });
    expect(res.ok).toBe(false);
    expect(insertedValues).toHaveLength(0);
  });
});
