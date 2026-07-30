/**
 * Depth-first search for the first human-readable message inside a
 * react-hook-form `errors` object. The default `Object.values(errors)[0].message`
 * only reads TOP-LEVEL errors — when the sole failure is on a nested array field
 * (products / addresses / bankAccounts / extraContacts), the top entry has no
 * `.message` (the message lives at `errors.products[2].qty.message`), so submit
 * silently blocks with no visible reason. This walks into arrays/objects to find
 * that message. `ref` is skipped so we never recurse into a live DOM node.
 */
export function firstErrorMessage(errors: unknown): string | undefined {
  if (!errors || typeof errors !== "object") return undefined;
  const node = errors as { message?: unknown };
  if (typeof node.message === "string" && node.message.trim()) return node.message;
  for (const key of Object.keys(errors as Record<string, unknown>)) {
    if (key === "ref" || key === "type" || key === "types") continue;
    const found = firstErrorMessage((errors as Record<string, unknown>)[key]);
    if (found) return found;
  }
  return undefined;
}
