import "server-only";
import { getCurrentEmployee } from "@/lib/auth/current";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { isPermissionsEnforced } from "@/lib/auth/enforcement";

/**
 * What a module shell needs to render its permission-aware chrome.
 *
 * Returns `null` when permission enforcement is OFF — the app's state until an
 * admin turns it on in Admin → Access Control. `null` means "no restriction",
 * which is deliberately distinct from "holds no permissions" (an empty array):
 * conflating the two would silently hide the whole pipeline from everyone the
 * moment the flag flipped.
 */
export async function allowedPermissionKeys(): Promise<string[] | null> {
  if (!(await isPermissionsEnforced())) return null;
  const me = await getCurrentEmployee().catch(() => null);
  if (!me) return [];
  const { keys } = await getEffectivePermissions(me);
  return [...keys];
}
