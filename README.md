# Carbide India WMS

Work-management system for **Carbide India** (Yogeshwar Engineering Pvt Ltd, Nashik). Tracks tasks, status, performance, and accountability across the team in one editorial, status-coded surface.

## Quickstart

```bash
pnpm install
cp .env.example .env.local          # fill in Neon / Clerk / Vercel Blob / Resend values
pnpm verify:env                     # checks every required env var is present + well-formed
pnpm db:migrate                     # apply schema migrations to your Neon database
pnpm seed:defaults                  # seed status labels + org_settings singleton
pnpm dev                            # http://localhost:3000
```

The dashboard renders an empty-state welcome hero until at least one task or employee exists. `pnpm seed` populates fake dev data (~20 employees, ~1200 tasks); `pnpm seed:reset` wipes it.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Production server |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript strict |
| `pnpm test` | Vitest unit tests on transforms |
| `pnpm test:visual` | Playwright visual smoke tests (Chromium, desktop + mobile viewport) |
| `pnpm db:generate` | Generate SQL migration from Drizzle schema |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL` |
| `pnpm db:studio` | Open Drizzle Studio (visual DB browser) |
| `pnpm seed:defaults` | Seed status labels + org_settings (run once on a fresh DB) |
| `pnpm seed` | Seed dev DB with realistic fake data |
| `pnpm seed:reset` | Truncate seeded data |
| `pnpm verify:env` | Validate `.env.local` against everything the app needs |
| `pnpm gen:icons` | Regenerate PWA icons + favicon from `public/brand/logo.png` |

## Stack

Next.js 16 · React 19 · TypeScript strict · Tailwind v4 + custom CSS · Neon Postgres · Drizzle ORM · Clerk · Vercel Blob · Resend · TanStack Table · Recharts · Motion · Radix primitives · Vercel.

## Authentication & Environments

Auth is **invite-only**. There is no public sign-up.

### Identity stack

- **Clerk** issues identity. `clerkMiddleware` protects every route; the embedded `<SignIn />` widget on `/login` handles credentials, forgot-password, and MFA.
- An **employees** row (Neon Postgres, Drizzle ORM) is the authorization source of truth. Clerk users link to their employee row by email on first sign-in; deactivated employees lose access immediately.
- An **IP allowlist gate** (`ALLOWED_IPS`) runs in middleware before Clerk on every request. Empty = disabled (dev); in production set it to the office IPs.
- **Vercel Blob** stores uploaded files — public avatars and private documents (client-direct uploads, presigned downloads).
- **Resend** sends notification + digest emails (optional — skipped when unset).

### Environments

| Env | Database | Auth | Notes |
|---|---|---|---|
| Local dev | Neon dev branch | Clerk dev instance | `cp .env.example .env.local`, fill values, `pnpm verify:env`. |
| Preview / Production | Neon production | Clerk production instance | Env vars live in the Vercel project settings. First admin via `pnpm bootstrap-admin`. |

### Bootstrap the first admin

```bash
cp .env.local .env.bootstrap     # copy env for the bootstrap script
pnpm bootstrap-admin --email admin@carbideindia.com --name "Admin Name"
```

This inserts only the admin's employees row — they then sign in through Clerk with that email and are linked automatically. The script deletes `.env.bootstrap` afterwards. Full runbook at `docs/runbooks/bootstrap-first-admin.md`.

### Resetting state

```bash
pnpm seed:reset      # truncates tables back to empty (no users)
```

After a reset, run `pnpm seed:defaults` to restore status labels + org settings, then `pnpm bootstrap-admin` to recreate the first admin.
