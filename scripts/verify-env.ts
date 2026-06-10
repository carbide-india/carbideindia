/**
 * Verifies that .env.local has every value the app needs.
 *
 * Usage:  pnpm verify:env
 *
 * Read-only. Does NOT create users, send emails, or write to the DB. Just
 * checks env-var presence + shape. Prints a per-section checklist and exits
 * non-zero if anything is missing or still on a placeholder value from
 * .env.local.example.
 */

type Check = { ok: boolean; label: string; detail?: string };

const PLACEHOLDER_MARKERS = [
  "PASSWORD",
  "replace_with_32_plus_random_chars",
  "re_test_xxxxxxxxxxxxxxxxxxxxxxxx",
  "pk_test_xxxxxxxx",
  "sk_test_xxxxxxxx",
];

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_MARKERS.some((m) => value.includes(m));
}

function check(label: string, value: string | undefined, validate?: (v: string) => string | null): Check {
  if (!value) return { ok: false, label, detail: "missing" };
  if (isPlaceholder(value)) return { ok: false, label, detail: "still on .env.local.example placeholder" };
  if (validate) {
    const err = validate(value);
    if (err) return { ok: false, label, detail: err };
  }
  return { ok: true, label, detail: redact(label, value) };
}

function redact(label: string, value: string): string {
  // Keep prefix + length, hide the rest, for secrets.
  if (/KEY|SECRET|TOKEN|PRIVATE/i.test(label)) {
    return `${value.slice(0, 6)}…(${value.length} chars)`;
  }
  return value;
}

function header(name: string) {
  console.log(`\n${name}`);
  console.log("─".repeat(name.length));
}

function print(checks: Check[]): { ok: number; fail: number } {
  let ok = 0;
  let fail = 0;
  for (const c of checks) {
    const mark = c.ok ? "✓" : "✗";
    const tail = c.detail ? ` — ${c.detail}` : "";
    console.log(`  ${mark} ${c.label}${tail}`);
    c.ok ? ok++ : fail++;
  }
  return { ok, fail };
}

/**
 * "Optional" section: every var in the map is checked, but missing vars
 * produce a warning (▲) rather than a failure (✗).  Returns the number
 * of WARN entries so the caller can include them in the summary without
 * bumping the non-zero exit code.
 */
function optional(
  sectionName: string,
  vars: Record<string, (v: string) => string | true>,
): { ok: number; warn: number } {
  header(`${sectionName}  (optional)`);
  let ok = 0;
  let warn = 0;
  for (const [name, validate] of Object.entries(vars)) {
    const value = process.env[name];
    if (!value) {
      console.log(`  ▲ ${name} — not set (will be skipped at runtime)`);
      warn++;
      continue;
    }
    if (isPlaceholder(value)) {
      console.log(`  ▲ ${name} — still on .env.local.example placeholder`);
      warn++;
      continue;
    }
    const result = validate(value);
    if (result === true) {
      console.log(`  ✓ ${name} — ${redact(name, value)}`);
      ok++;
    } else {
      console.log(`  ▲ ${name} — ${result}`);
      warn++;
    }
  }
  return { ok, warn };
}

async function main() {
  console.log("\nVerifying .env.local ...");

  // ─── Database ─────────────────────────────────────────────────────
  header("Database");
  const dbChecks = print([
    check("DATABASE_URL", process.env.DATABASE_URL, (v) =>
      v.startsWith("postgresql://") || v.startsWith("postgres://") ? null : "expected postgresql:// URI"),
  ]);

  // ─── Vercel Blob ──────────────────────────────────────────────────
  // Required in production (avatars + documents storage); optional locally,
  // where uploads/downloads just fail gracefully until the store exists.
  const isProduction =
    process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
  const blobValidate = (v: string) =>
    v.startsWith("vercel_blob_rw_") ? null : "expected vercel_blob_rw_ prefix";
  let blobChecks = { ok: 0, fail: 0 };
  let blobOptional = { ok: 0, warn: 0 };
  if (isProduction) {
    header("Vercel Blob (storage)");
    blobChecks = print([
      check("BLOB_READ_WRITE_TOKEN", process.env.BLOB_READ_WRITE_TOKEN, blobValidate),
    ]);
  } else {
    blobOptional = optional("Vercel Blob (storage)", {
      BLOB_READ_WRITE_TOKEN: (v) => blobValidate(v) === null || "expected vercel_blob_rw_ prefix",
    });
  }

  // ─── Clerk ────────────────────────────────────────────────────────
  header("Clerk (auth)");
  const clerkChecks = print([
    check("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, (v) =>
      v.startsWith("pk_") ? null : "expected pk_ prefix"),
    check("CLERK_SECRET_KEY", process.env.CLERK_SECRET_KEY, (v) =>
      v.startsWith("sk_") ? null : "expected sk_ prefix"),
  ]);

  // ─── Resend ──────────────────────────────────────────────────────
  header("Resend (email)");
  const resendChecks = print([
    check("RESEND_API_KEY", process.env.RESEND_API_KEY, (v) =>
      v.startsWith("re_") ? null : "expected re_ prefix"),
    check("RESEND_FROM_EMAIL", process.env.RESEND_FROM_EMAIL, (v) =>
      /<.+@.+>/.test(v) || /^.+@.+$/.test(v) ? null : "expected \"Name <addr@domain>\" or addr@domain"),
  ]);

  // ─── Site URL ────────────────────────────────────────────────────
  header("Site");
  const siteChecks = print([
    check("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL, (v) =>
      v.startsWith("http://") || v.startsWith("https://") ? null : "expected http(s):// prefix"),
  ]);

  // ─── Cron ────────────────────────────────────────────────────────
  header("Cron (daily digest)");
  const cronChecks = print([
    check("CRON_SECRET", process.env.CRON_SECRET, (v) =>
      v.length >= 16 ? null : `must be ≥16 chars (got ${v.length})`),
  ]);

  // ─── Optional sections ───────────────────────────────────────────
  // Missing vars disable the matching feature at runtime.
  const webPushOptional = optional("Web Push", {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: (v) => v.length > 80 || "VAPID public key",
    VAPID_PRIVATE_KEY:            (v) => v.length > 40 || "VAPID private key",
    VAPID_SUBJECT:                (v) => /^mailto:/.test(v) || "must start with mailto:",
  });

  const ipGateOptional = optional("IP allowlist gate", {
    ALLOWED_IPS: (v) =>
      v.split(",").every((s) => s.trim().length > 0) ||
      "comma-separated IPs (empty entries found)",
  });

  // ─── Summary ─────────────────────────────────────────────────────
  const totalOk =
    dbChecks.ok +
    blobChecks.ok +
    blobOptional.ok +
    clerkChecks.ok +
    resendChecks.ok +
    siteChecks.ok +
    cronChecks.ok +
    webPushOptional.ok +
    ipGateOptional.ok;
  const totalFail =
    dbChecks.fail +
    blobChecks.fail +
    clerkChecks.fail +
    resendChecks.fail +
    siteChecks.fail +
    cronChecks.fail;
  const totalWarn = blobOptional.warn + webPushOptional.warn + ipGateOptional.warn;

  console.log(
    `\nSummary: ${totalOk} OK · ${totalFail} failed · ${totalWarn} optional warnings`,
  );
  if (totalFail > 0) {
    console.log("\nFix the ✗ entries in .env.local, then re-run: pnpm verify:env");
    process.exit(1);
  }
  console.log("\n✓ Environment ready. Next steps:");
  console.log("    pnpm db:migrate            # apply schema migrations");
  console.log("    pnpm bootstrap-admin --email <you> --name \"<You>\"");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nverify-env crashed:", err);
  process.exit(2);
});

// Make this file a module so its top-level names don't collide with other
// import-free scripts in the same tsc program.
export {};
