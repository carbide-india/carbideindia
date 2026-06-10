import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Client-direct uploads mean the documents server actions now receive a
 * client-supplied blob pathname. These tests pin the critical guard: a
 * malicious caller must NOT be able to register (or trigger cleanup-deletion
 * of) blobs outside the `documents/` prefix — e.g. someone's avatar.
 */

vi.mock("@/lib/auth/current", () => ({
  requireUser: vi.fn().mockResolvedValue({
    id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    name: "Emp",
    isAdmin: false,
    isActive: true,
  }),
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimitOrError: vi.fn(() => null) }));

const deleteBlob = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/storage/blob", () => ({
  deleteBlob: (...args: unknown[]) => deleteBlob(...args),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// db mock: findFirst drives both the duplicate-pathname check and
// authorizeDocumentMutation; insert records values for create + audit rows.
const findFirst = vi.fn();
const insertedValues: Record<string, unknown>[] = [];
const updateCalls: Record<string, unknown>[] = [];
vi.mock("@/lib/db", () => {
  const insertBuilder = {
    values: (v: Record<string, unknown>) => {
      insertedValues.push(v);
      return {
        returning: () => Promise.resolve([{ id: "11111111-1111-4111-8111-111111111111" }]),
        then: (resolve: (v: unknown) => unknown) => resolve(undefined),
      };
    },
  };
  return {
    db: {
      query: { documents: { findFirst: (...args: unknown[]) => findFirst(...args) } },
      insert: () => insertBuilder,
      update: () => ({
        set: (v: Record<string, unknown>) => {
          updateCalls.push(v);
          return { where: () => Promise.resolve() };
        },
      }),
    },
  };
});

beforeEach(() => {
  findFirst.mockReset().mockResolvedValue(undefined);
  deleteBlob.mockClear();
  insertedValues.length = 0;
  updateCalls.length = 0;
});

const DOC_ID = "22222222-2222-4222-8222-222222222222";
const ownedDoc = {
  id: DOC_ID,
  title: "Quarterly report",
  description: null,
  storagePath: "documents/old-abc123.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1234,
  uploadedById: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
};

describe("createDocumentRecord pathname guard", () => {
  it("rejects pathnames outside documents/ and never touches the blob or DB", async () => {
    const { createDocumentRecord } = await import("@/app/(app)/documents/actions");
    const res = await createDocumentRecord({
      title: "Sneaky",
      pathname: "avatars/x", // malicious: someone else's avatar blob
      contentType: "image/png",
      sizeBytes: 100,
    });
    expect(res).toEqual({ ok: false, error: "Invalid storage path." });
    expect(insertedValues).toHaveLength(0);
    // Critically the action must not "roll back" (delete) a blob it doesn't own.
    expect(deleteBlob).not.toHaveBeenCalled();
  });

  it("rejects denylisted extensions even under documents/", async () => {
    const { createDocumentRecord } = await import("@/app/(app)/documents/actions");
    const res = await createDocumentRecord({
      title: "Malware",
      pathname: "documents/payload.exe",
      contentType: "application/pdf",
      sizeBytes: 100,
    });
    expect(res).toEqual({ ok: false, error: "This file type is not allowed." });
    expect(insertedValues).toHaveLength(0);
  });

  it("rejects sizes above 25 MB", async () => {
    const { createDocumentRecord } = await import("@/app/(app)/documents/actions");
    const res = await createDocumentRecord({
      title: "Huge",
      pathname: "documents/big-abc.pdf",
      contentType: "application/pdf",
      sizeBytes: 25 * 1024 * 1024 + 1,
    });
    expect(res).toEqual({ ok: false, error: "File exceeds 25 MB." });
    expect(insertedValues).toHaveLength(0);
  });

  it("accepts a valid documents/ pathname and inserts the row", async () => {
    const { createDocumentRecord } = await import("@/app/(app)/documents/actions");
    const res = await createDocumentRecord({
      title: "Quarterly report",
      description: "Q2",
      pathname: "documents/report-abc123.pdf",
      contentType: "application/pdf",
      sizeBytes: 2048,
    });
    expect(res).toEqual({ ok: true, id: "11111111-1111-4111-8111-111111111111" });
    expect(insertedValues[0]).toMatchObject({
      storagePath: "documents/report-abc123.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
    });
  });

  it("rejects a pathname another document row already points at", async () => {
    findFirst.mockResolvedValueOnce(ownedDoc); // duplicate-pathname lookup hits
    const { createDocumentRecord } = await import("@/app/(app)/documents/actions");
    const res = await createDocumentRecord({
      title: "Duplicate",
      pathname: "documents/old-abc123.pdf",
      contentType: "application/pdf",
      sizeBytes: 100,
    });
    expect(res).toEqual({ ok: false, error: "This file is already registered." });
    expect(insertedValues).toHaveLength(0);
  });
});

describe("replaceDocumentFile pathname guard", () => {
  it("rejects pathnames outside documents/", async () => {
    findFirst.mockResolvedValueOnce(ownedDoc); // authorizeDocumentMutation lookup
    const { replaceDocumentFile } = await import("@/app/(app)/documents/actions");
    const res = await replaceDocumentFile(DOC_ID, {
      pathname: "avatars/x",
      contentType: "image/png",
      sizeBytes: 100,
    });
    expect(res).toEqual({ ok: false, error: "Invalid storage path." });
    expect(updateCalls).toHaveLength(0);
    expect(deleteBlob).not.toHaveBeenCalled();
  });
});
