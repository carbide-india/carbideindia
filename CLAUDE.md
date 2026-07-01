# Carbide India WMS

Work-management system for **Carbide India** (legal: Yogeshwar Engineering Pvt Ltd, W-150(A) MIDC Ambad, Nashik, Maharashtra — carbideindia.com). Cemented-carbide products manufacturer: tungsten carbide cutting inserts, mining tools, wear parts, tungsten-copper electrodes.

Brand: red script "Carbide" + indigo block "India" on white. Indigo `#3F3F94` (brand/accent roles), red `#D32F2F` (semantic/error roles — never swap these). Logo: `public/brand/logo.png`. Tagline: "Your Tungsten Carbide & Tungsten Copper Partners".

## Stack

- **Next.js 16 App Router** (Turbopack dev), React 19, TypeScript strict (`noUncheckedIndexedAccess`)
- **Neon** serverless Postgres via **Drizzle ORM** + postgres-js (`prepare: false` — Neon pooled endpoint is transaction-mode pgbouncer). Schema: `db/schema.ts` (single source of truth; drizzle-kit generate must always produce "no changes" against `db/migrations/`)
- **Clerk** auth (`@clerk/nextjs` v7): `clerkMiddleware` in `middleware.ts`, `auth()`/`currentUser()` server-side. Invite-only — admins invite via Clerk invitations; employee rows link to Clerk users on first sign-in by verified email (`lib/auth/current.ts`)
- **Vercel Blob** storage: avatars public, documents private + presigned downloads; documents upload browser→Blob directly via `/api/documents/upload` (`handleUpload`) — never through a server action body (1MB/4.5MB limits)
- **Resend** email + **web-push** (VAPID) — the only two notification channels
- **IP gate**: `middleware.ts` checks `ALLOWED_IPS` (comma-separated env var) before auth; non-listed IPs get a 403 rewrite to `/access-denied`. Empty var = gate disabled (dev). Localhost bypass is non-production only.
- Hosting: **Vercel** (IP-restricted, not public)

## Commands

```bash
pnpm dev               # dev server (Turbopack)
pnpm build && pnpm start
pnpm typecheck         # tsc --noEmit — run before claiming any work done
pnpm lint              # eslint (0 errors required; ~73 legacy warnings exist)
pnpm test              # vitest unit suite (flaky under load — rerun with --maxWorkers=4 before investigating)
pnpm test:visual       # playwright (needs built app + real env)
pnpm db:generate       # drizzle-kit generate (offline; needs DATABASE_URL set, dummy ok)
pnpm db:migrate        # apply migrations (scripts/apply-all-migrations.ts)
pnpm db:studio         # drizzle studio
pnpm seed:defaults     # idempotent label/status/org-settings seed (fresh DB bootstrap)
pnpm bootstrap-admin --email <e> --name <n>   # first admin row
pnpm verify:env        # validate .env.local against required vars
pnpm gen:icons         # regenerate PWA icons from public/brand/logo.png (python + PIL)
```

Fresh-DB bootstrap order: `db:migrate` → `seed:defaults` → `bootstrap-admin`.

## Conventions

- Server Components fetch via `lib/queries/*.ts`; mutations via Server Actions colocated in `app/**/actions.ts`. No client-side data fetching of large sets.
- Auth gates: `requireUser()` / `requireAdmin()` from `lib/auth/current.ts` at the top of every server action and protected query.
- URL-as-state via nuqs for filters; toast via `fireToast` (`lib/toast.ts`).
- Status labels/colors live in DB (`status_settings`), seeded by `scripts/seed-defaults.ts`, edited in admin → never hardcode status colors in components.
- The unique index name `tasks_short_id_uidx` is string-matched in error-retry logic (`app/(app)/tasks/actions.ts`, `import-actions.ts`) — renaming it in schema breaks task creation.
- Emails: react-email templates in `emails/`, sent via Resend; from-name "Carbide India WMS".

## Domain language (sales pipeline — Phase 2+)

Carbide's sales flow, per Manan (the client): **Inquiry → Primary Feasibility → Costing → Quotation → Sales Order (PO)**.

- **SM number**: unique sales-module id auto-generated per inquiry (one client, 4 inquiries = 4 SM numbers); the SM is the linkable "repo" for everything about that inquiry.
- **KYC form** = client onboarding: Product Types (multi-select checkboxes), Customer Type + Industry Type (single-select, admin-managed masters), contact person auto-fetch, meeting date/start/end.
- **Masters** (admin-editable): Customer Type, Industry Type, Product Types, Internal Grade, Tolerance, Condition.
- **Enquiry Checklist**: 9 fixed rows (Priority 1–5, Size & Drawing, Tolerance, Grade/Application, Quantity, Condition, Contact Person, Company Name & Address, Is it Export?) each marked V (client gave info) / x (not given) / # (we already know) + remark.
- **Costing**: two sheets — BU/BO (bought-out) and In-house; auto weight calculations (pressing, block, direct, total, RM price).
- **Sample Register**: physical sample tracking (number, location, responsible person, photos, status); downstream dropdowns default to first option so dashboards can flag incomplete stages.
- **Quotation**: auto-generated PDF (SM number, date, customer, product breakdown) → reviewer preview → Send.

Full design: `docs/superpowers/specs/2026-06-11-carbide-india-wms-design.md` (gitignored, local only). Phase 1 plan: `docs/superpowers/plans/2026-06-11-carbide-phase-1-foundation.md`.

## Env

Copy `.env.example` → `.env.local`. Required: `DATABASE_URL` (Neon pooled), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`, `BLOB_READ_WRITE_TOKEN`, `NEXT_PUBLIC_SITE_URL`. Production additionally: `ALLOWED_IPS` (the 2 office IPs), `CRON_SECRET`. Optional: Resend, VAPID web-push, Sentry DSN, `SLOW_QUERY_MS`.

## Things that will bite you

- Don't run document uploads through server actions — body limits. Use the existing client-upload flow.
- `pnpm build` needs a structurally-valid `DATABASE_URL` (placeholder works; it's parsed, not connected).
- Tests are load-flaky; `--maxWorkers=4` before chasing ghosts.
- Migrations are **append-only and sequential** (`0000_*` … `00NN_*`, currently through 0028) — NOT squashed to a single init. Never edit an already-applied migration SQL by hand; add a new numbered migration instead. `drizzle-kit generate` must always stay at "no changes" parity against `db/schema.ts` (the single source of truth).
- `db/enums.ts` keeps deprecated task statuses (follow_up_1/2/3, cancelled, transferred, need_help) for data compat — they're filtered from UI, don't remove.
