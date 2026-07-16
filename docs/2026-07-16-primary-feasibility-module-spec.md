# Primary Feasibility — Standalone Module Spec

**Date:** 2026-07-16
**Status:** Approved design (4/4 decisions = elite path), pending build
**Owner build:** ultracode workflow, reviewed before commit; migrations applied manually by user

Carbide's pipeline: **Client KYC → Sample Register → New Enquiry → Primary Feasibility → Costing → Quotation → Sales Order**. This spec extracts Primary Feasibility from the enquiry module into its own `/hub` module, modelled on the APQP *Team Feasibility Commitment* gate (feasibility sits after RFQ intake, before costing; a signed-off artifact with an audit trail).

## Decisions (locked)

1. **Scope:** Full MNC DFM review — keep the 5 per-product checks + add drawing completeness, tooling/process, material/grade supply, surface/condition finish, lead-time, export/regulatory + overall risk rating.
2. **Approval:** Engineer proposes verdict → one approver signs off to release to costing (two-role, audited).
3. **Costing gate:** HARD — costing/quotation blocked until feasibility is Approved (`proceed_to_costing`).
4. **Verdicts:** 4-outcome (Feasible / Feasible-with-deviation / Needs-info / Not-feasible) + Low/Med/High risk.

---

## 1. Data model (migration — additive, append-only)

### 1a. Expand per-product `inquiry_item_feasibility`
Existing 5 verdict+note pairs stay. Add per-product technical checks (each `feas_check_verdict` nullable + text note):
- `drawingCompletenessVerdict/Note` — is the part adequately defined to evaluate?
- `toolingProcessVerdict/Note` — process/tooling capability to make it
- `materialSupplyVerdict/Note` — grade/material availability & suitability
- `surfaceFinishVerdict/Note` — surface/condition finish achievability
- `specialProcessVerdict/Note` — coating, grinding, EDM, etc.
- `itemRiskRating` — `feas_risk` (low/medium/high), nullable
- `itemVerdict` — rolled-up `feas_check_verdict` for the product (engineer's per-part call)

### 1b. New SM-level review record — `inquiry_feasibility` (one row per inquiry)
Replaces the scattered embedded `feas*` columns (legacy block deprecated, see §5). Columns:
- `inquiryId` (uuid, unique, FK → inquiries, cascade)
- `feasibilityStatus` `feasibility_status` (new status model, §2) not null default `not_started`
- `overallVerdict` `feas_check_verdict` (feasible / feasible_with_deviation / need_info / not_feasible), nullable
- `riskRating` `feas_risk` (low/medium/high), nullable
- `exportRegulatoryVerdict/Note`, `leadTimeVerdict/Note` — SM-level `feas_check_verdict` + note
- `assumptions` (text) — what we assumed where info was missing
- `customerClarifications` (text) — required info to request from customer
- `actionItems` (text) — internal actions before costing
- `priority` `feas_priority`, `export` boolean (moved off inquiries)
- `engineerId` (FK employees) — who ran the review, `submittedAt` timestamptz
- `approverId` (FK employees) — who signed off, `approvedAt` timestamptz, `approvalNote` text
- `createdAt/updatedAt`

Per-product technical detail lives in `inquiry_item_feasibility`; the SM row rolls up + carries commercial/approval/gate fields.

## 2. Status model (`FEASIBILITY_STATUSES` — revised, adds values only)

| status | label | tone | meaning |
|---|---|---|---|
| `not_started` | Not Started | slate | in queue, untouched |
| `in_review` | In Review | blue | engineer working (replaces `initiated`) |
| `need_info` | Need Info | amber | blocked on customer/internal clarification |
| `pending_approval` | Pending Approval | purple | engineer submitted, awaiting approver |
| `proceed_to_costing` | Approved · Proceed to Costing | green | approver signed off → costing unlocked |
| `not_feasible` | Not Feasible | red | rejected; no quote |

Keep deprecated `initiated`, `need_help`, `primary_feasibility_done` in the enum for data compat (filtered from UI), per the enum-deprecation convention. Add `in_review`, `pending_approval`, `not_feasible`.

**Gated transitions:** `not_started → in_review → {need_info ↔ in_review} → pending_approval → {proceed_to_costing | not_feasible}`. Only an approver can set `proceed_to_costing` / `not_feasible`; engineer can set up to `pending_approval`.

## 3. Roles & routing

- **Feasibility engineer** (any employee assigned) — fills per-product + SM checks, sets per-part verdicts, proposes overall verdict + risk, submits → `pending_approval`.
- **Approver** = **any admin** (`requireAdmin`). Reviews, then Approve (`proceed_to_costing`) or Reject (`not_feasible`) with a note. Records `approverId`/`approvedAt`. No new permission system.
- Audit: submittedAt/engineerId + approvedAt/approverId + approvalNote give the signed-off trail.

## 4. Costing hard gate

- `createCosting` (and the costing "start" entry points) check the inquiry's `inquiry_feasibility.feasibilityStatus === 'proceed_to_costing'`; otherwise return a blocked result with a clear message ("Primary Feasibility must be approved before costing").
- Costing queue / SM workspace show a locked state with a link to the feasibility review when not yet approved.

## 5. Module in /hub (decouple from enquiry)

- **Routes:** new top-level `app/(app)/feasibility/` — `page.tsx` (dashboard/queue), `[id]/page.tsx` (review workspace), `layout.tsx` mounting a new **`FeasibilityModuleShell`**. Relocate from `app/(app)/enquiries/feasibility/*` (add redirects from old paths).
- **Hub tile:** add card to `app/(app)/hub/page.tsx` MODULES (title "FEASIBILITY", href `/feasibility`, ClipboardCheck icon, brand gradient).
- **Nav registry:** add `ModuleDef` in `components/layout/modules.ts` (key `feasibility`, home `/feasibility`, match `["/feasibility"]`, items: Dashboard, My Reviews, Approvals, Feasibility Master).
- Remove the conditional "Primary Feasibility" push + the "New Enquiry" title bleed from `enquiry-module-shell.tsx`.
- Reuse `RegisterDataTable` for the queue (own columns/filters), the unified `Field`/`Segmented`/`Select` primitives, `Chip` + status colors.

## 6. UI

- **Dashboard/queue:** KPI strip (Total / In Review / Need Info / Pending Approval / Approved / Not Feasible) + a prominent `RegisterDataTable` (SM, Company, Products, Engineer, Verdict, Risk, Status, Age-in-queue) with feasibility filters + bulk status.
- **Review workspace** (`[id]`): SM header; per-product cards each showing the read-only spec context + the expanded check grid (verdict Segmented + note per criterion); SM-level panel (export/lead-time, risk rating, overall verdict, assumptions, clarifications, action items); submit-for-approval; and an **Approval bar** (visible to approver when `pending_approval`) with Approve / Reject + note. Uses the unified field system (44px controls, one radius/border, redesigned segmented toggle).

## 7. Build phases (ultracode)

0. Enums + schema (new table, expanded per-product table, new enum values) + generated migration SQL.
1. Queries (`lib/queries/feasibility.ts`) + validators (`lib/validators/feasibility.ts`).
2. Server actions (save review, submit for approval, approve/reject) + costing hard-gate.
3. Module plumbing: hub tile, `modules.ts`, shell, layout, routes + old-path redirects; remove enquiry-shell coupling.
4. UI: dashboard/queue + review workspace + approval bar (unified field system).
5. Verify: typecheck, lint, build; unit tests for the gate + status transitions.

**Not applied automatically:** migration is run by the user (`MIGRATE_DATABASE_URL … pnpm db:migrate`); nothing committed/pushed until reviewed.

---

## Build outcome (2026-07-16)

**Built (migration `0055_lame_mindworm.sql`):** enums (statuses + `feasible_with_deviation` + `feas_risk`), `inquiry_feasibility` table + expanded `inquiry_item_feasibility`; `lib/queries/feasibility.ts`, `lib/validators/feasibility.ts`; `app/(app)/feasibility/actions.ts` (save / submit / approve-reject / bulk) + costing hard-gate in `costings/actions.ts`; hub tile, `modules.ts` entry, `FeasibilityModuleShell` + layout, routes `/feasibility`, `/feasibility/[id]`, `/feasibility/approvals`, redirects from old `/enquiries/feasibility/*`; UI (`feasibility-queue-table`, `feasibility-review-workspace` with approval bar). typecheck + lint + 9 unit tests green.

**Known follow-up (flagged, not done):** the SM-Workspace embedded "Feasibility" tab (`components/erp/sm-workspace.tsx`) still uses the LEGACY path (`saveFeasibilityFull` → `inquiries.feasibilityStatus` + per-product only). It no longer drives the costing gate (which reads `inquiry_feasibility.status`). Reconcile by pointing that tab at the new module (read-only summary + link) or removing it — decide with the user.

