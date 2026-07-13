import type {
  clients,
  clientAddresses,
  clientBankAccounts,
} from "@/db/schema";
import type { CreateClientKycParsed } from "@/lib/validators/client-kyc";

/**
 * Shared KYC writer helpers (ERP Phase 2 — Customer Master).
 *
 * Extracted verbatim from `adminUpdateClientKyc` so the new-client onboarding
 * path (`createClientKyc`) persists the FULL form identically. These are pure
 * functions — no db access — so both server actions can compose them inside
 * their own `db.transaction`.
 *
 * Callers pass the validator's PARSED output (`safeParse(...).data`), so we type
 * against `z.output` — `isTransporter`/`creditLimit` are already coerced.
 */

type ClientInsert = typeof clients.$inferInsert;
type AddressInsert = typeof clientAddresses.$inferInsert;
type BankInsert = typeof clientBankAccounts.$inferInsert;

/** Parsed KYC value (post-`safeParse`). */
type Kyc = CreateClientKycParsed;

/**
 * Full overwrite patch for the form-managed `clients` columns — a cleared
 * field becomes NULL. EXCLUDES `name` and `updatedAt` (callers set those).
 * Byte-identical to the inline patch object in `adminUpdateClientKyc`.
 */
export function buildKycClientPatch(v: Kyc): Partial<ClientInsert> {
  return {
    customerTypeIds: v.customerTypeIds ?? null,
    industryTypeIds: v.industryTypeIds ?? null,
    // Mirror the legacy singular columns to the FIRST selected id (back-compat).
    customerTypeId: v.customerTypeIds?.[0] ?? null,
    industryTypeId: v.industryTypeIds?.[0] ?? null,
    productTypeIds: v.productTypeIds ?? null,
    grade: v.grade ?? null,
    departmentId: v.departmentId ?? null,
    state: v.state ?? null,
    city: v.city ?? null,
    addressLine1: v.addressLine1 ?? null,
    addressLine2: v.addressLine2 ?? null,
    addressLine3: v.addressLine3 ?? null,
    addressLine4: v.addressLine4 ?? null,
    pinCode: v.pinCode ?? null,
    gstin: v.gstin ?? null,
    panNo: v.panNo ?? null,
    gstRegistrationType: v.gstRegistrationType ?? null,
    placeOfSupply: v.placeOfSupply ?? null,
    isTransporter: v.isTransporter ?? false,
    billToAddress: v.billToAddress ?? null,
    paymentTerms: v.paymentTerms ?? null,
    freightCharges: v.freightCharges ?? null,
    qtyDeviation: v.qtyDeviation ?? null,
    creditDays: v.creditDays ?? null,
    creditLimit: v.creditLimit != null ? String(v.creditLimit) : null,
    bankName: v.bankName ?? null,
    bankAccountNo: v.bankAccountNo ?? null,
    bankIfsc: v.bankIfsc ?? null,
    bankBranch: v.bankBranch ?? null,
    bankAccountHolder: v.bankAccountHolder ?? null,
    shipToAddress: v.shipToAddress ?? null,
    transporter: v.transporter ?? null,
    otherReferences: v.otherReferences ?? null,
    msmeUdyamNo: v.msmeUdyamNo ?? null,
    tags: v.tags ?? null,
    kycMeetingDate: v.meetingDate ? new Date(v.meetingDate) : null,
    kycMeetingStart: v.meetingStart ?? null,
    kycMeetingEnd: v.meetingEnd ?? null,
    kycMeetingNotes: v.meetingNotes ?? null,
    kycSalesPersonId: v.kycSalesPersonId ?? null,
    businessCardFrontUrl: v.businessCardFrontUrl ?? null,
    businessCardBackUrl: v.businessCardBackUrl ?? null,
    businessCardOtherUrls: v.businessCardOtherUrls ?? null,
    notes: v.notes ?? null,
  };
}

/**
 * Normalize submitted addresses into insert rows. Enforces "exactly one
 * primary per addressType": none flagged → first occurrence of that type
 * becomes primary; several flagged → only the first stays. `sortOrder = index`.
 * Returns `undefined` when `addresses` was not submitted at all.
 */
export function normalizeAddressRows(
  clientId: string,
  addresses: Kyc["addresses"],
): AddressInsert[] | undefined {
  if (addresses === undefined) return undefined;

  const primarySeenForType = new Set<string>();
  const flaggedCountByType = new Map<string, number>();
  for (const a of addresses) {
    if (a.isPrimary) {
      flaggedCountByType.set(a.addressType, (flaggedCountByType.get(a.addressType) ?? 0) + 1);
    }
  }
  return addresses.map((a, i) => {
    let isPrimary = false;
    const flagged = flaggedCountByType.get(a.addressType) ?? 0;
    if (flagged === 0) {
      // None flagged for this type → first occurrence becomes primary.
      if (!primarySeenForType.has(a.addressType)) {
        isPrimary = true;
        primarySeenForType.add(a.addressType);
      }
    } else if (a.isPrimary && !primarySeenForType.has(a.addressType)) {
      // Keep only the first flagged of this type.
      isPrimary = true;
      primarySeenForType.add(a.addressType);
    }
    return {
      clientId,
      addressType: a.addressType,
      isPrimary,
      label: a.label ?? null,
      line1: a.line1 ?? null,
      line2: a.line2 ?? null,
      line3: a.line3 ?? null,
      line4: a.line4 ?? null,
      city: a.city ?? null,
      state: a.state ?? null,
      country: a.country ?? null,
      pinCode: a.pinCode ?? null,
      gstin: a.gstin ?? null,
      notes: a.notes ?? null,
      sortOrder: i,
    };
  });
}

/**
 * Normalize submitted bank accounts into insert rows. Enforces "exactly one
 * primary overall": none flagged → first becomes primary; several flagged →
 * only the first stays. `sortOrder = index`. Returns `undefined` when
 * `bankAccounts` was not submitted at all.
 */
export function normalizeBankRows(
  clientId: string,
  bankAccounts: Kyc["bankAccounts"],
): BankInsert[] | undefined {
  if (bankAccounts === undefined) return undefined;

  const hasFlagged = bankAccounts.some((b) => b.isPrimary);
  let primaryAssigned = false;
  return bankAccounts.map((b, i) => {
    let isPrimary = false;
    if (!hasFlagged) {
      if (!primaryAssigned) {
        isPrimary = true;
        primaryAssigned = true;
      }
    } else if (b.isPrimary && !primaryAssigned) {
      isPrimary = true;
      primaryAssigned = true;
    }
    return {
      clientId,
      isPrimary,
      bankName: b.bankName ?? null,
      accountNo: b.accountNo ?? null,
      ifsc: b.ifsc ?? null,
      branch: b.branch ?? null,
      accountHolder: b.accountHolder ?? null,
      accountType: b.accountType ?? null,
      notes: b.notes ?? null,
      sortOrder: i,
    };
  });
}

/**
 * Mirror the PRIMARY normalized children into the legacy `clients` columns
 * (back-compat). Mutates `patch` in place. Only overrides columns whose
 * corresponding child rows were submitted; otherwise leaves the scalar values
 * `buildKycClientPatch` already set. Byte-identical to the inline mirror.
 */
export function applyPrimaryMirror(
  patch: Partial<ClientInsert>,
  addressRows: AddressInsert[] | undefined,
  bankRows: BankInsert[] | undefined,
): void {
  if (addressRows !== undefined) {
    const primaryRegistered = addressRows.find(
      (r) => r.addressType === "registered" && r.isPrimary,
    );
    patch.addressLine1 = primaryRegistered?.line1 ?? null;
    patch.addressLine2 = primaryRegistered?.line2 ?? null;
    patch.addressLine3 = primaryRegistered?.line3 ?? null;
    patch.addressLine4 = primaryRegistered?.line4 ?? null;
    patch.city = primaryRegistered?.city ?? null;
    patch.state = primaryRegistered?.state ?? null;
    patch.country = primaryRegistered?.country ?? null;
    patch.pinCode = primaryRegistered?.pinCode ?? null;

    const primaryBillTo = addressRows.find(
      (r) => r.addressType === "bill_to" && r.isPrimary,
    );
    patch.billToAddress = primaryBillTo?.line1 ?? null;

    const primaryShipTo = addressRows.find(
      (r) => r.addressType === "ship_to" && r.isPrimary,
    );
    patch.shipToAddress = primaryShipTo?.line1 ?? null;
  }
  if (bankRows !== undefined) {
    const primaryBank = bankRows.find((r) => r.isPrimary);
    patch.bankName = primaryBank?.bankName ?? null;
    patch.bankAccountNo = primaryBank?.accountNo ?? null;
    patch.bankIfsc = primaryBank?.ifsc ?? null;
    patch.bankBranch = primaryBank?.branch ?? null;
    patch.bankAccountHolder = primaryBank?.accountHolder ?? null;
  }
}
