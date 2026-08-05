/**
 * Undo / redo for the bulk-upload sheet.
 *
 * react-datasheet-grid gives us block paste, keyboard navigation and row
 * insert/delete, but NOT undo — so we own it. Because the grid is a controlled
 * component, history is simply a stack of whole-sheet snapshots: cheap to
 * reason about, and impossible to desync from what is rendered.
 *
 * Pure (no React) so the invariants can be unit-tested directly.
 */

export interface History<T> {
  /** Snapshots, oldest first. Always non-empty; index 0 is the initial state. */
  past: T[][];
  /** Index into `past` of the state currently shown. */
  cursor: number;
}

/** How many snapshots to retain. Older ones are dropped from the front. */
export const HISTORY_LIMIT = 50;

export function createHistory<T>(initial: T[]): History<T> {
  return { past: [initial], cursor: 0 };
}

/**
 * Record a new state. Anything the user had undone past is discarded — the
 * standard editor behaviour: branching from a mid-history point rewrites the
 * future rather than keeping it.
 */
export function push<T>(history: History<T>, next: T[]): History<T> {
  const kept = history.past.slice(0, history.cursor + 1);
  kept.push(next);
  const overflow = Math.max(0, kept.length - HISTORY_LIMIT);
  const past = overflow > 0 ? kept.slice(overflow) : kept;
  return { past, cursor: past.length - 1 };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.cursor > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.cursor < history.past.length - 1;
}

export function undo<T>(history: History<T>): History<T> {
  return canUndo(history) ? { ...history, cursor: history.cursor - 1 } : history;
}

export function redo<T>(history: History<T>): History<T> {
  return canRedo(history) ? { ...history, cursor: history.cursor + 1 } : history;
}

/** The state to render. Never undefined — `past` always holds the initial entry. */
export function current<T>(history: History<T>): T[] {
  return history.past[history.cursor] ?? history.past[history.past.length - 1] ?? [];
}
