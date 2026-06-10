import { describe, it, expect } from "vitest";
import { resolveChannels } from "@/lib/notifications/resolve-channels";

describe("resolveChannels", () => {
  it("returns the matrix entry when present", () => {
    const out = resolveChannels("task_assigned", {
      task_assigned: ["email"],
    });
    expect(out).toEqual(["email"]);
  });

  it("falls back to all channels when the key is missing", () => {
    const out = resolveChannels("task_assigned", {});
    expect(out).toEqual(["email", "push"]);
  });

  it("ignores unknown channel names in matrix data", () => {
    const out = resolveChannels("task_assigned", {
      task_assigned: ["email", "carrier_pigeon" as never],
    });
    expect(out).toEqual(["email"]);
  });

  it("returns an empty array if the matrix lists no channels", () => {
    const out = resolveChannels("overdue_digest", { overdue_digest: [] });
    expect(out).toEqual([]);
  });

  it("preserves channel order from the matrix entry", () => {
    const out = resolveChannels("approved", {
      approved: ["push", "email"],
    });
    expect(out).toEqual(["push", "email"]);
  });
});
