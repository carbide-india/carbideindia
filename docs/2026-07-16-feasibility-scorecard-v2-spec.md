# Primary Feasibility v2 — Decision Scorecard (rebuild spec)

**Date:** 2026-07-16
**Supersedes:** the v1 checklist module (`2026-07-16-primary-feasibility-module-spec.md`) — full rethink: process + UX.
**Decisions locked:** whole-concept redesign · decision-scorecard model · foundation open to change (new migration).

Replace the pass/fail checklist with a **quantitative, weighted, risk-scored feasibility index** that gates costing. Grounded in verified methods: AHP weighting, Cp/Cpk process-capability for tolerance, AIAG-VDA Action Priority for risk, weighted aggregation, and Stephen Few's bullet-graph scorecard UX.

## 1. The scoring model

**Dimensions** (each scored 0–100 + risk + note; default AHP-style weights, **admin-editable** in a Feasibility master):

| Dimension | Default weight | What it judges |
|---|---:|---|
| Tolerance achievability | 22 | can our process hold the spec'd tolerances (Cp/Cpk-informed) |
| Geometry / Shape (DFM) | 20 | shape manufacturability, features, aspect ratios |
| Grade / Material supply | 16 | grade suitability + RM availability |
| Tooling / Process capability | 14 | press/tooling/route available |
| Quantity / Lot economics | 10 | lot size vs economic/press capacity |
| Surface / Condition finish | 8 | achievable finish/condition |
| Drawing / Spec completeness | 6 | is the part adequately defined to judge |
| Export / Regulatory | 4 | export/compliance clearance |

**Per-dimension score → verdict + risk** (Few's rule: never a bare number; show score + threshold + state):
- 75–100 → **Feasible** · 55–74 → **Feasible-with-deviation** · < 55 → **Not-feasible**
- Risk **Low / Medium / High** (AIAG-VDA Action-Priority style — set by engineer, guided by rubric).
- Optional **Critical** flag per dimension.
- Tolerance dimension gets a helper: Cpk < 1.0 → fail band, 1.0–1.33 → marginal, ≥ 1.33 → good (maps to score + risk).

**Aggregate feasibility index** (0–100): weighted roll-up of dimension scores.

**Overall risk:** worst-case dimension risk, escalated to High if ≥ 2 dimensions are High.

**Blocker (veto) logic** — an explicit business rule layered on the score (per research: do NOT read veto rules off the AP table): any **Critical** dimension that is *Not-feasible* or *High risk* forces **Not Feasible** regardless of the aggregate.

**Overall verdict thresholds** (admin-editable defaults):
- **Feasible** — index ≥ 75, no blocker, overall risk ≤ Medium
- **Feasible-with-deviation** — index 55–74 and no blocker
- **Needs-info** — any dimension left unscored / marked need-info
- **Not-feasible** — index < 55 **or** any blocker

Only **Feasible / Feasible-with-deviation (approved)** releases costing.

## 2. Data model (new migration 0056)

- Drop reliance on the v1 per-check verdict columns (kept nullable for compat).
- `feasibility_dimensions` (config master, admin-editable): key, label, default weight, sort, active. Seeded with the 8 above.
- `inquiry_feasibility_scores` (per inquiry × dimension): dimensionKey, weightSnapshot, score (0–100), risk (low/med/high), isCritical, verdict, note.
- Extend `inquiry_feasibility` (SM-level): `overallScore` (numeric), `overallVerdict`, `overallRisk`, `blockerCount` — plus the existing approval/gate/audit fields (status, engineer/approver, submittedAt/approvedAt/note) which stay.

Scoring math lives in a pure `lib/feasibility/score.ts` (weighted roll-up + blocker + verdict + risk), unit-tested — mirrors the costing engine pattern.

## 3. Scorecard UX (the screen)

- **Verdict header:** large **Feasibility index %**, verdict chip, overall **risk badge**, and a **blocker count** callout. Approve → Costing / Request-info / Not-feasible actions (admin approval retained + audited).
- **Per-dimension breakdown:** a vertical stack of **horizontal bullet-graph rows** (score bar 0–100, the go/no-go threshold as a target marker, weight %, risk tag, verdict label, note) — bullet graphs, not radial gauges (empirically faster/more accurate). Single-hue intensity bands (colorblind-safe; brand red stays semantic/error only).
- **Blockers surfaced at top**; drivers (highest-weight low scores) highlighted.
- Queue/dashboard: sortable by index, risk, blocker — KPI strip by verdict.

## 4. Open tuning (defaults now, Carbide to calibrate)

Weights, thresholds, and the Cpk→score mapping ship as **admin-editable defaults**; Manan/Alok's engineers tune them against historical won/lost/problem jobs (research: back-test before trusting the gate). Not a blocker to build.

## 5. Build phases (ultracode)

0. Scoring engine `lib/feasibility/score.ts` (pure, tested) + enums/schema/migration 0056 + dimension seed.
1. Queries + validators (scores payload).
2. Actions (save scores → recompute index/verdict/risk/blockers; submit; admin approve/reject) + costing gate reads the verdict.
3. Rebuild the review workspace as the **scorecard** (bullet graphs + verdict header + approval bar) and the queue (index/risk/blocker columns).
4. Verify: engine unit tests (roll-up, blocker, thresholds) + typecheck + lint + build.

v1 module scaffolding (routes, shell, hub tile, gate) is **reused**; only the model + workspace UI are replaced.
