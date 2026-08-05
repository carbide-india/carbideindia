import { describe, expect, it } from "vitest";
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  createHistory,
  current,
  push,
  redo,
  undo,
} from "@/lib/import/grid/history";

describe("bulk-upload sheet history", () => {
  it("starts at the initial state with nothing to undo or redo", () => {
    const h = createHistory([1, 2]);
    expect(current(h)).toEqual([1, 2]);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it("undo walks back and redo walks forward", () => {
    let h = createHistory([0]);
    h = push(h, [1]);
    h = push(h, [2]);
    expect(current(h)).toEqual([2]);

    h = undo(h);
    expect(current(h)).toEqual([1]);
    h = undo(h);
    expect(current(h)).toEqual([0]);
    expect(canUndo(h)).toBe(false);

    h = redo(h);
    expect(current(h)).toEqual([1]);
    expect(canRedo(h)).toBe(true);
  });

  it("undoing then editing discards the redo branch", () => {
    let h = createHistory([0]);
    h = push(h, [1]);
    h = push(h, [2]);
    h = undo(h); // showing [1], [2] is redoable
    expect(canRedo(h)).toBe(true);

    h = push(h, [9]); // new edit from here
    expect(current(h)).toEqual([9]);
    expect(canRedo(h)).toBe(false);
    h = undo(h);
    expect(current(h)).toEqual([1]);
  });

  it("undo at the start and redo at the end are no-ops, not crashes", () => {
    const h = createHistory([0]);
    expect(current(undo(h))).toEqual([0]);
    expect(current(redo(h))).toEqual([0]);
  });

  it("caps retained snapshots and keeps the newest", () => {
    let h = createHistory([0]);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = push(h, [i]);
    expect(h.past.length).toBe(HISTORY_LIMIT);
    expect(current(h)).toEqual([HISTORY_LIMIT + 20]);
    // Still fully rewindable within the retained window.
    for (let i = 0; i < HISTORY_LIMIT - 1; i++) h = undo(h);
    expect(canUndo(h)).toBe(false);
  });
});
