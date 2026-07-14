import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  clientAddresses,
  clientBankAccounts,
  type ClientAddress,
  type ClientBankAccount,
} from "@/db/schema";

/** Row shape for a normalized client address. */
export type ClientAddressRow = ClientAddress;
/** Row shape for a normalized client bank account. */
export type ClientBankRow = ClientBankAccount;

/**
 * Normalized addresses for a client (ERP Phase 2 - Customer Master). Ordered by
 * address type then sort order so the register/record render deterministically.
 */
export async function getClientAddresses(
  clientId: string,
): Promise<ClientAddressRow[]> {
  return db
    .select()
    .from(clientAddresses)
    .where(eq(clientAddresses.clientId, clientId))
    .orderBy(asc(clientAddresses.addressType), asc(clientAddresses.sortOrder));
}

/**
 * Normalized bank accounts for a client (ERP Phase 2 - Customer Master).
 * Primary account first, then by sort order.
 */
export async function getClientBankAccounts(
  clientId: string,
): Promise<ClientBankRow[]> {
  return db
    .select()
    .from(clientBankAccounts)
    .where(eq(clientBankAccounts.clientId, clientId))
    .orderBy(desc(clientBankAccounts.isPrimary), asc(clientBankAccounts.sortOrder));
}
