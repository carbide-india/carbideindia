# Pipeline review with Manan — open items

**Date of review:** 2026-08 · **Recorded by:** Hetesh · **Status:** implementation shipped, these decisions outstanding

Manan walked the whole sales pipeline and asked for one thing above all: **at every stage
you must be able to see what is LEFT**. His example — *"40 enquiries came in today. I did
Primary on all 40. I did Secondary on 20. So Costing shows 20. But I only costed 3 — 17
costings are NOT DONE. I need to see the Not Done."*

Everything below is implemented EXCEPT the items in this file, which need a human decision
before they can be built without guessing.

---

## 1. Factory sales-order fields — needs a sitting with Alok  ⟵ Manan asked for this to be written down

> *"तो वो तेरे को लिख के रखना पड़ेगा कि आलोक भाई से बैठ के समझना है कि आप एक्स्ट्रा क्या डिटेल भेजते हो"*
> — you'll have to write it down that you must sit with Alok and understand what extra
> details you send.

One Sales Order produces **two outputs**:

- **Customer copy** — what already goes out today (roughly what's in the Google Drive copy).
- **Factory / production copy** — carries the extra internal detail so production can start
  making material.

**Built:** the two-copy structure, plus the three fields Manan named himself — internal
grade, production notes (header + per line), and part numbers — and a `production_so_sent`
flag. The factory copy is visibly marked INTERNAL.

**Not built, deliberately:** the complete extra-field list. `sales_orders.factory_copy_detail`
is an intentionally EMPTY jsonb holding-pen. Nothing may invent keys inside it.

**To resolve with Alok:**
- What is the full list of extra details on the factory copy today?
- Which are per-order vs per-line?
- Which are mandatory before the copy can be issued?

---

## 2. Negotiation: `negotiation_approved` vs `order_won`

Manan said *"नेगोशिएशन अप्रूव्ड हो गया... तो इशू सेल्स ऑर्डर"* — Negotiation Approved is
what enables Issue Sales Order. That gate is **built**, with `order_won` accepted as a legacy
synonym so already-won rows stay convertible.

**Outstanding:** does `negotiation_approved` eventually REPLACE `order_won`, or do both stay
(approve → then mark Order Won)? `order_won` is load-bearing — it auto-provisions the draft
sales order — so it was not deprecated. Related: `order_lost` / `order_abandoned` sit on a
separate commercial-outcome axis and have no home in the five-bucket vocabulary. Keep them
as an outcome axis, or add a sixth bucket?

---

## 3. Costing revision trigger

Manan: *"अगर वो नॉट अप्रूव्ड है... तो वो नया कॉस्टिंग बनेगा उसका"* — a not-approved
negotiation produces a new costing.

**Built:** the revision spine (`revision_no`, `supersedes_costing_id`, `is_latest_revision`,
`revision_reason`, `revised_from_negotiation_id`), the revision list with a diff between
revisions, the rule that Quotation consumes the LATEST revision, and a **manual** "request
costing revision" action from the negotiation where the user picks the sheets and states why.

**Deliberately manual.** Whether a failed negotiation should fork cost sheets *by itself* was
not stated in the recording, and an ERP that silently forks cost sheets is worse than one
that asks.

**To confirm:** automatic or manual? And when revision N+1 is created — does the quotation
regenerate, does approval (`approvedOption` / `finalUnitCost` / `isLocked`) reset to Pending
Approval, and does the superseded revision keep or lose its `isChosen` flag?

---

## 4. Legacy costing rows

Existing rows sit in `in_process` / `done`, now deprecated in favour of `draft` /
`costing_approved`. **No data backfill was written** — the migration is additive and the
mapping is a business decision. Legacy values fold at read time, so nothing is broken.

**To confirm:** migrate live `done` rows to `costing_approved`, or leave `done` as a
permanent legacy synonym?

---

## 5. Secondary Feasibility approval trail

Only the status bucket column was added. Primary Feasibility has a full two-role audit trail
(engineer → submitted → approver → approved-at → note).

**To confirm:** does Secondary need its own approver / approved-at / approval-note columns,
or does its Pending Approval bucket reuse the existing Secondary-done stamp?

---

## 6. Vendor GSTIN constraints

Website, GSTIN and brochure attachments are built. No uniqueness index and no DB-level format
check were added.

**To confirm:** should GSTIN be unique across active vendors, and required when
`is_gst_applicable = true`?

---

## Settled during the review (no action needed)

- **Costing's pending bucket is labelled "Not Done"**, not "Not Started" — Manan said it twice.
- **No bucket is called "Costing Register"** — the register is where approved sheets live; the
  status is "Costing Approved".
- **Dates read DD-MM-YYYY** everywhere human-facing.
