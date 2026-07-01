# Glossary — the frozen-names contract

> **Phase 0 artifact of the ERP redesign** (blueprint: `docs/2026-07-01-carbide-erp-redesign-architecture.md`).
> This file is the single reference for *physical table/enum names* ↔ *conceptual / UI names*.

## The rule

- **Schema (`db/schema.ts`), migrations (`db/migrations/*.sql`), and queries (`lib/queries/*.ts`, server actions) use the PHYSICAL names below — verbatim.**
- **Prose, UI copy, docs, and comments MAY use the conceptual names** (enquiry-product, quote-line, …).
- **NEVER rename a physical table or the enum values below.** Renames are pure migration risk with zero SSOT benefit, and several are string-matched in code:
  - `tasks_short_id_uidx` is string-matched in task-create error-retry logic (`app/(app)/tasks/actions.ts`, `import-actions.ts`) — see CLAUDE.md.
  - The blueprint's Canonical Decisions freeze the `*_items`, `costings` table names precisely so the string-matched index / error-retry patterns don't break.
- This is the enforcement anchor for `scripts/ci/ssot-lint.ts`, whose denylist grows phase-by-phase.

## Table names (physical ↔ conceptual)

| Physical table       | Conceptual / UI name              | One-line purpose |
|----------------------|-----------------------------------|------------------|
| `items`              | Item / Product Master (the Item)  | Canonical product **spec** SSOT: shape/grade/tolerance/condition/dims/HSN/UoM. No customer, qty, price, or SM number. Everything points at it via `item_id`. |
| `master_options`     | Masters (dropdown options)        | One table, many `kind`s (customer type, industry type, product type, shape, internal grade, tolerance, condition …). Admin-managed reference values. |
| `clients`            | Client / Customer                 | The customer entity (with `client_contacts`, `client_addresses`, `client_bank_accounts`, `client_industry` join). |
| `inquiries`          | Enquiry / SM (the SM repo)        | One customer ask = one SM number = one `inquiries` row; the linkable repo for the whole pipeline. |
| `inquiry_items`      | enquiry-product / SM line         | The customer's per-product ask under an SM (raw entry buffer + `item_id` pointer to the resolved spec). |
| `feasibility_checks` | Enquiry Checklist row             | The 9 fixed feasibility rows per enquiry-product (V / x / # + remark). |
| `costings`           | Costing                           | Cost per item + route (in-house / bought-out); cost history per Item. |
| `quotations`         | Quotation (header)                | A quote document under an SM. |
| `quotation_items`    | quote-line                        | Per-product line on a quotation (`item_id` + qty; frozen price only when sent). |
| `negotiations`       | Negotiation (header)              | An active round-set under a quotation. |
| `negotiation_items`  | negotiation-line / round-line     | Per-product negotiated line (`item_id` + agreed qty/price fact of the round). |
| `sales_orders`       | Sales Order / PO (header)         | The confirmed order (contract). |
| `sales_order_items`  | SO-line / order-line              | Per-product ordered line (`item_id` + confirmed qty; snapshot at confirmation). |
| `job_cards`          | Job Card / work order             | Production work order; spec read-through via `item_id`, customer via `client_id`. |
| `samples`            | Sample Register entry             | Physical sample tracking (number, location, responsible person, photos, status). |
| `documents`          | Document                          | Drawings / specs / attachments (Blob-backed, polymorphic owner). |
| `audit_log`          | Audit trail                       | Append-only record of changes (deactivate-only governance). |
| `status_settings`    | Status (labels/colours)           | DB-driven status labels + colour tokens (never hardcode status colours in components). |
| `org_settings`       | Org settings singleton            | The id=1 row every reader assumes exists (notification matrix etc.). |

> Note: `costings`, `quotation_items`, `negotiation_items`, `sales_order_items` are **frozen names** even though the Item-as-SSOT redesign changes their columns. Table renames are prohibited (Canonical Decisions).

## Frozen enum decisions (from the blueprint's Canonical Decisions)

| Enum                | Frozen values                                                        | Notes |
|---------------------|---------------------------------------------------------------------|-------|
| `item_status`       | `draft` \| `active` \| `archived` (+ `superseded`, reserved)         | `superseded` reserved only for merge-with-history. Draft-item is canonical: every `inquiry_items.item_id` eventually points at a real row (draft or active) — there is no "null until resolved" state. |
| `costing_route`     | `inhouse` \| `bought_out`                                            | The two costing sheets (In-house / BU-BO). |
| task statuses       | (unchanged) — deprecated values `follow_up_1/2/3`, `cancelled`, `transferred`, `need_help` retained for data compat | Filtered from UI, never removed (`db/enums.ts`). |

## Canonical shape master NAMES (the 6 seeded shapes)

The only valid `master_options` rows with `kind = 'shape'` seeded by `scripts/seed-defaults.ts`:

- `Cylinder - Reg`
- `Cylinder - Spl`
- `H. Cylinder - Reg`
- `H. Cylinder - Spl`
- `Flat - Reg`
- `Flat - Spl`

Legacy / free-text enquiry shape strings are mapped to these by `lib/masters/shape-normalize.ts`; anything unmappable is surfaced by `scripts/report-unresolvable-shapes.ts` for master cleanup before the Phase 4 backfill.

## Provenance rule

`origin_*` columns on `items` (`origin_inquiry_id`, `origin_sm_number`, `origin_customer_name`, `origin_enquiry_date`, `origin_cust_product_name`, `origin_qty`) are **write-once, display-only, and NEVER queried** for usage, dedup, or search. ssot-lint enforces this in a later phase.
