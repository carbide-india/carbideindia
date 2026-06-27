# RBAC Matrix — Carbide India WMS (ERP Phase 4)

Every master mutation and protected query enforces an explicit auth gate at its
first line: `requireUser()` (any active, signed-in employee) or `requireAdmin()`
(employee with `is_admin`). Gates come from `lib/auth/current.ts`; `requireUser`
redirects to `/login` if absent/deactivated, `requireAdmin` throws `Forbidden`.

## Roles
- **Admin** (`employees.is_admin = true`): full master governance.
- **User** (any active employee): sales-floor operations — onboard clients,
  create inquiries/items, attach item documents.

## Master data — who can do what

| Entity | Action | Server action | Gate |
|---|---|---|---|
| Client (roster) | create | `createClient` | Admin |
| Client (roster) | rename / toggle order/active | `updateClient` | Admin |
| Client (KYC) | full edit | `adminUpdateClientKyc` | Admin |
| Client | **deactivate** (soft) | `deleteClient` | Admin |
| Client | **reactivate** | `reactivateClient` | Admin |
| Client (KYC) | onboard new / fill KYC | `createClientKyc` | User |
| Client (KYC) | sales-floor patch | `updateClientKyc` | User |
| Client | GSTIN/PAN dup probe (read) | `checkClientDuplicate` | User |
| Client documents | upload / delete | `saveClientDocument` / `deleteClientDocument` | Admin |
| Item | create (or reuse) | `createItem` | User |
| Item | **deactivate** (soft) | `deactivateItem` | Admin |
| Item | **reactivate** | `reactivateItem` | Admin |
| Item documents/drawings | upload / delete | `saveItemDocument` / `deleteItemDocument` | User |
| Master option (Customer/Industry/Product Type, Grade, Tolerance, Condition) | create / bulk / update | `createMasterOption` / `createMasterOptionsBulk` / `updateMasterOption` | Admin |

**Rationale for User-level writes:** client onboarding (KYC), inquiry/item
creation, and item-drawing attachment are sales-floor activities the whole team
performs. Governance actions that retire or restructure a master
(deactivate/reactivate, roster create, KYC overwrite, master-option edits,
client-document management) are Admin-only.

## Deactivate-only policy (no hard delete)
No code path hard-deletes a client or an item. "Delete" is a **soft deactivate**:
`is_active = false` + `deleted_at = now()`; reactivate clears both. A master
referenced by past inquiries/quotes/negotiations/orders keeps its row so those
transactions stay intact. Master options have no delete action at all.

## Audit trail (tamper-evident)
- Every master mutation calls `recordAudit` (fire-and-forget; a logging failure
  never fails the business mutation). Actions: `create | update | delete | restore`.
- `audit_log` is **append-only at the database**: a Postgres trigger
  (`audit_log_block_mutation`, migration 0024) RAISEs on any UPDATE or DELETE of
  `audit_log`, so the legally-required change history cannot be altered or erased
  from the application or a stray query. INSERT (new entries) is unaffected.

## Dedup enforcement
- **Clients:** GSTIN/PAN are unique across **active** clients. `createClientKyc`
  and `adminUpdateClientKyc` hard-block a save that collides with another active
  client (`findActiveDuplicateClient`); the KYC form also shows a non-blocking
  warning on blur (`checkClientDuplicate`).
- **Items:** deduped by spec fingerprint (`items.dedup_key`) — an identical
  product reuses the existing item code rather than creating a duplicate.
